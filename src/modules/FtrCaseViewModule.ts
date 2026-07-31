import { Page, type Locator } from '@playwright/test';
import { FtrCaseViewPage } from '../pages/FtrCaseViewPage';
import { Logger } from '../utils/Logger';
import { WaitHelper } from '../utils/WaitHelper';
import { WorkflowActions } from '../utils/WorkflowActions';

export interface FtrCaseHeader {
    caseNumber: string;
    status: string;
    caseType: string;
}

/** A document-coordinate rectangle to mask in a Sauce Visual snapshot (assignable to RegionIn). */
export interface VisualIgnoreRegion {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * FtrCaseViewModule — Layer 2: Business Logic
 *
 * Reads the FTR `generic-view-case` page (opened in a new tab) so a spec can
 * verify the values persisted from create + submit. Returns raw values only —
 * no assertions live in this layer. Constructed in the spec with the new-tab
 * page (same pattern as CaseViewModule / CaseSearchPage).
 */
export class FtrCaseViewModule {
    private caseViewPage: FtrCaseViewPage;
    private logger: Logger;
    private waitHelper: WaitHelper;
    private workflowActions: WorkflowActions;

    constructor(private page: Page) {
        this.caseViewPage = new FtrCaseViewPage(page);
        this.logger = Logger.create('FtrCaseViewModule');
        this.waitHelper = new WaitHelper(page);
        this.workflowActions = new WorkflowActions(page);
    }

    private escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /** Strip a leading label (and any separators) from a normalized text blob. */
    private stripLabel(raw: string, label: string): string {
        return raw
            .replace(/\s+/g, ' ')
            .trim()
            .replace(new RegExp(`^${this.escapeRegExp(label)}\\s*:?\\s*`, 'i'), '')
            .trim();
    }

    /**
     * Wait until the FTR case-view page for the given case id has fully rendered
     * (Case Properties section visible and loaders settled), dismissing the App
     * Guide overlay if it is open.
     */
    async waitForReady(caseId: string): Promise<void> {
        this.logger.step(1, `Waiting for the FTR case-view page to be ready for ${caseId}`);

        // The App Guide widget can render off-screen, so dispatch the click rather than a normal click.
        await this.page.getByRole('button', { name: /close app guide/i }).first().dispatchEvent('click').catch(() => null);

        const heading = this.caseViewPage.getCasePropertiesHeading();
        await this.waitHelper.waitForVisible(heading, { timeout: 30000 });
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 30000, stableWindowMs: 1000 }).catch(() => null);
    }

    /** Read the header card values (Case # / Status / Case Type). */
    async getHeader(): Promise<FtrCaseHeader> {
        this.logger.step(2, 'Reading the case header (Case # / Status / Case Type)');
        const caseNumber = await this.readHeaderValue('Case #');
        const status = await this.readHeaderValue('Status');
        const caseType = await this.readHeaderValue('Case Type');
        this.logger.info(`Header → Case #: ${caseNumber} | Status: ${status} | Case Type: ${caseType}`);
        return { caseNumber, status, caseType };
    }

    private async readHeaderValue(label: string): Promise<string> {
        const field = this.caseViewPage.getCaseHeaderField(label);
        await this.waitHelper.waitForVisible(field, { timeout: 15000 });
        const raw = (await field.innerText().catch(() => '')) ?? '';
        return this.stripLabel(raw, label);
    }

    /** Read a labelled value from the "Case Properties" section. */
    async getCaseProperty(label: string): Promise<string> {
        return this.readArticleValue('Case Properties', label);
    }

    /** Read a labelled value from the "Repair Information" section (Repair Order #, Odometer, Title, Repair Date). */
    async getRepairInfoValue(label: string): Promise<string> {
        return this.readArticleValue('Repair Information', label);
    }

    /** Read a labelled value from the "Repair Details" section (Condition Description, Diagnostic Steps, Repair Process). */
    async getRepairDetail(label: string): Promise<string> {
        return this.readArticleValue('Repair Details', label);
    }

    private async readArticleValue(sectionName: string, label: string): Promise<string> {
        const article = this.caseViewPage.getSectionArticle(sectionName, label);
        await this.waitHelper.waitForVisible(article, { timeout: 15000 });
        const raw = (await article.innerText().catch(() => '')) ?? '';
        const value = this.stripLabel(raw, label);
        this.logger.info(`${sectionName} → ${label}: ${value}`);
        return value;
    }

    /** Read the selected value of a labelled dropdown in the "Repair Information" section. */
    async getRepairComboboxValue(label: string): Promise<string> {
        const combobox = this.caseViewPage.getSectionCombobox('Repair Information', label);
        await this.waitHelper.waitForVisible(combobox, { timeout: 15000 });
        const value = ((await combobox.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
        this.logger.info(`Repair Information → ${label} (dropdown): ${value}`);
        return value;
    }

    /** Whether the given radio option is selected within a Repair Information radio group. */
    async isRepairRadioChecked(groupText: string, option: string): Promise<boolean> {
        const radio = this.caseViewPage.getSectionRadio('Repair Information', groupText, option);
        await this.waitHelper.waitForVisible(radio, { timeout: 15000 }).catch(() => null);
        return radio.isChecked().catch(() => false);
    }

    /** Whether the "ship the part(s) within 30 calendar days" question is answered "Yes". */
    async isPartShipQuestionYes(): Promise<boolean> {
        const radio = this.caseViewPage.getSectionRadio('Part Number Information', 'ship the part', 'Yes');
        await this.waitHelper.waitForVisible(radio, { timeout: 15000 }).catch(() => null);
        return radio.isChecked().catch(() => false);
    }

    /** Read the DTC grid row text for the given code (e.g. "B1234 Yes"). */
    async getDtcRowText(dtcCode: string): Promise<string> {
        const row = this.caseViewPage.getSectionGridRow('DTC Information', dtcCode);
        await this.waitHelper.waitForVisible(row, { timeout: 15000 });
        return ((await row.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
    }

    /** Read the Part Number grid row text for the given part number (e.g. "7283050R30P1 1 1 Yes"). */
    async getPartRowText(partNumber: string): Promise<string> {
        const row = this.caseViewPage.getSectionGridRow('Part Number Information', partNumber);
        await this.waitHelper.waitForVisible(row, { timeout: 15000 });
        return ((await row.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Prepare the case view for a true full-page screenshot.
     *
     * The FTR `generic-view-case` page renders its sections inside a fixed-height inner
     * scroll container (flex / viewport-height layout), so the document stays one viewport
     * tall and native fullPage clips everything below the fold (the capture stopped at
     * Repair Information). Two levers fix this, applied together and from runtime geometry
     * only — never guessed selectors:
     *   1. Release real scroll containers (overflow/height/max-height) so nothing is clipped.
     *   2. Grow the viewport to the measured content height so flex/100vh scrollers expand to
     *      fit all their content with no inner scrolling.
     */
    async prepareFullPageCapture(): Promise<void> {
        this.logger.step(7, 'Expanding scroll containers + sizing viewport for a true full-page snapshot');

        // 1) Release any inner scroll containers so their content is not clipped by overflow.
        await this.page.evaluate(() => {
            const isScrollable = (el: Element): boolean => {
                const style = window.getComputedStyle(el);
                return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 50;
            };
            for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
                if (isScrollable(el)) {
                    el.style.setProperty('overflow', 'visible', 'important');
                    el.style.setProperty('height', 'auto', 'important');
                    el.style.setProperty('max-height', 'none', 'important');
                }
            }
            document.documentElement.style.setProperty('height', 'auto', 'important');
            document.body.style.setProperty('height', 'auto', 'important');
        });

        // 2) Grow the viewport to the full content height so flex / 100vh inner scrollers
        //    expand to fit, leaving nothing behind an inner scrollbar.
        const current = this.page.viewportSize() ?? { width: 1440, height: 900 };
        const contentHeight = await this.page.evaluate(() => {
            const heights = [document.documentElement.scrollHeight, document.body.scrollHeight];
            for (const el of Array.from(document.querySelectorAll('*'))) {
                if (el.scrollHeight > el.clientHeight) {
                    heights.push(el.getBoundingClientRect().top + window.scrollY + el.scrollHeight);
                }
            }
            return Math.ceil(Math.max(...heights));
        });
        const targetHeight = Math.min(Math.max(contentHeight + 200, current.height), 20000);
        this.logger.info(`Full-page prep → content height ${contentHeight}px; resizing viewport to ${current.width}x${targetHeight}`);
        await this.page.setViewportSize({ width: current.width, height: targetHeight });

        // Let layout settle after the resize so geometry is final before measuring/capturing.
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 5000, stableWindowMs: 500 }).catch(() => null);
    }

    /**
     * Build Sauce Visual ignore regions for the run-to-run dynamic VALUES only — never the
     * labels. Each region is sized to cover just the changing value (the breadcrumb token, the
     * header value to the right of its label, the value below an article's `<h6>` label, or a
     * randomised dropdown's combobox), so the static labels and overall layout stay in the
     * visual comparison.
     *
     * The page is scrolled to the top first so each `boundingBox()` is reported in document
     * coordinates, which matches the full-page screenshot Sauce diffs against. Off-screen or
     * zero-size locators are skipped so a missing field never breaks the run.
     *
     * Dynamic values masked: breadcrumb #FTR…, vehicle mileage, header Case # / Status, Repair
     * Information (Repair Order #, Odometer, Repair Date, and the randomised Service Category /
     * Section / Sub Component / Condition dropdowns), and Repair Details (Condition Description,
     * Repair Process, Diagnostic Steps). Static fields (Title, radios, Case Properties, DTC,
     * Part Number) and ALL labels stay compared.
     */
    async getDynamicVisualIgnoreRegions(): Promise<VisualIgnoreRegion[]> {
        this.logger.step(8, 'Computing Sauce Visual ignore regions for dynamic VALUES (labels kept)');
        await this.page.evaluate(() => window.scrollTo(0, 0));

        const regions: VisualIgnoreRegion[] = [];
        const push = (region: VisualIgnoreRegion | null): void => {
            if (region) {
                regions.push(region);
            }
        };

        // Breadcrumb token + vehicle mileage pill — value-dominant, mask whole.
        push(await this.wholeRegion(this.caseViewPage.getBreadcrumbCaseNumber()));
        push(await this.wholeRegion(this.caseViewPage.getVehicleMileage()));

        // Header fields — labels are inline, so mask only the value to the right of the label.
        for (const label of ['Case #', 'Status']) {
            push(
                await this.valueRightOfLabel(
                    this.caseViewPage.getCaseHeaderField(label),
                    this.caseViewPage.getCaseHeaderLabel(label),
                ),
            );
        }

        // Repair Information article values — labels are stacked above, so mask below the label.
        for (const label of ['Repair Order #', 'Odometer', 'Repair Date']) {
            push(
                await this.valueBelowLabel(
                    this.caseViewPage.getSectionArticle('Repair Information', label),
                    this.caseViewPage.getSectionArticleHeading('Repair Information', label),
                ),
            );
        }

        // Randomised Repair Information dropdowns — the combobox itself is the value.
        for (const label of ['Service Category', 'Section', 'Sub Component', 'Condition']) {
            push(await this.wholeRegion(this.caseViewPage.getSectionCombobox('Repair Information', label)));
        }

        // Repair Details article values — labels stacked above, mask below the label.
        for (const label of ['Condition Description', 'Repair Process', 'Diagnostic Steps']) {
            push(
                await this.valueBelowLabel(
                    this.caseViewPage.getSectionArticle('Repair Details', label),
                    this.caseViewPage.getSectionArticleHeading('Repair Details', label),
                ),
            );
        }

        this.logger.info(`Resolved ${regions.length} dynamic value ignore region(s) for the visual snapshot`);
        return regions;
    }

    private toRegion(box: { x: number; y: number; width: number; height: number }): VisualIgnoreRegion {
        return {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
        };
    }

    /** Mask the full bounding box of a value-only locator (combobox, breadcrumb, mileage pill). */
    private async wholeRegion(locator: Locator): Promise<VisualIgnoreRegion | null> {
        const box = await locator.boundingBox().catch(() => null);
        return box && box.width > 0 && box.height > 0 ? this.toRegion(box) : null;
    }

    /** Mask only the value below a stacked label (article `<h6>` on top, value paragraph below). */
    private async valueBelowLabel(container: Locator, label: Locator): Promise<VisualIgnoreRegion | null> {
        const c = await container.boundingBox().catch(() => null);
        if (!c || c.width <= 0 || c.height <= 0) {
            return null;
        }
        const l = await label.boundingBox().catch(() => null);
        if (!l) {
            return this.toRegion(c);
        }
        const top = l.y + l.height;
        const height = c.y + c.height - top;
        return height > 1 ? this.toRegion({ x: c.x, y: top, width: c.width, height }) : this.toRegion(c);
    }

    /** Mask only the value to the right of an inline label (header "Case # FTR…"). */
    private async valueRightOfLabel(field: Locator, label: Locator): Promise<VisualIgnoreRegion | null> {
        const f = await field.boundingBox().catch(() => null);
        if (!f || f.width <= 0 || f.height <= 0) {
            return null;
        }
        const l = await label.boundingBox().catch(() => null);
        if (!l) {
            return this.toRegion(f);
        }
        const left = l.x + l.width;
        const width = f.x + f.width - left;
        return width > 1 ? this.toRegion({ x: left, y: f.y, width, height: f.height }) : this.toRegion(f);
    }
}

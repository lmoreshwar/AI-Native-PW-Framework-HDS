import { Page, type Locator } from '@playwright/test';

/**
 * FtrCaseViewPage — Layer 1: Locators Only (FTR `generic-view-case` page)
 *
 * Covers the read-only FTR case-view page opened from the "My Created" grid
 * (URL: /generic-view-case?caseId=FTR…). The page renders a header card
 * (Case # / Status / Case Type) followed by collapsible sections — Case
 * Properties, Repair Information, DTC Information, Part Number Information and
 * Repair Details — each exposed as an accessible `region`.
 *
 * Evidence: UAT ARIA snapshot of generic-view-case?caseId=FTR261780000
 * (header strongs, `region " Case Properties"`, `article "Markdown content"`
 *  with an h6 label + value paragraph, disabled comboboxes/radiogroups, and
 *  DTC / Part grids). No business logic or assertions in this layer.
 */
export class FtrCaseViewPage {
    constructor(private page: Page) {}

    private escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private exact(label: string): RegExp {
        return new RegExp(`^\\s*${this.escapeRegExp(label)}\\s*$`, 'i');
    }

    private contains(label: string): RegExp {
        return new RegExp(this.escapeRegExp(label), 'i');
    }

    /** The collapsible section region (e.g. "Case Properties", "Repair Information"). */
    getSectionRegion(sectionName: string): Locator {
        return this.page.getByRole('region', { name: this.contains(sectionName) }).first();
    }

    /** The "Case Properties" heading — readiness anchor for the loaded case-view page. */
    getCasePropertiesHeading(): Locator {
        return this.page.getByRole('heading', { name: /case properties/i }).first();
    }

    /**
     * Header card row that holds the Case # / Status / Case Type labels.
     *
     * TIER 3 (the header card exposes no region/role — the labels are plain
     * `<strong>` nodes inside class-named flex columns, so it is scoped
     * structurally to the row that contains the "Case #" label).
     */
    private caseHeaderRow(): Locator {
        return this.page
            .locator('div.flex-row')
            .filter({ has: this.page.locator('strong', { hasText: /case #/i }) })
            .first();
    }

    /** The header column container for a given label (Case # / Status / Case Type). */
    getCaseHeaderField(label: string): Locator {
        return this.caseHeaderRow()
            .locator('div')
            .filter({ has: this.page.locator('strong', { hasText: this.exact(label) }) })
            .first();
    }

    /**
     * The value container ("Markdown content" article) for a labelled field inside a
     * section region. Each article holds an `<h6>` label and a value node (paragraph
     * or list), so the caller reads the article text and strips the label.
     */
    getSectionArticle(sectionName: string, label: string): Locator {
        return this.getSectionRegion(sectionName)
            .locator('article')
            .filter({ has: this.page.getByRole('heading', { name: this.exact(label) }) })
            .first();
    }

    /** The selected-value combobox for a labelled dropdown inside a section region. */
    getSectionCombobox(sectionName: string, label: string): Locator {
        return this.getSectionRegion(sectionName)
            .getByRole('combobox', { name: this.exact(label) })
            .first();
    }

    /** A radio option inside a section region, matched by its visible group text and option label. */
    getSectionRadio(sectionName: string, groupText: string, option: string): Locator {
        return this.getSectionRegion(sectionName)
            .getByRole('radiogroup', { name: this.contains(groupText) })
            .getByRole('radio', { name: this.exact(option) })
            .first();
    }

    /** A grid row inside a section region that contains the given cell value. */
    getSectionGridRow(sectionName: string, rowText: string): Locator {
        return this.getSectionRegion(sectionName)
            .getByRole('row')
            .filter({ hasText: this.contains(rowText) })
            .first();
    }

    /**
     * The breadcrumb/title-bar case number at the top of the page (e.g. "#FTR261780008").
     * It is the only "#FTR…" token without a space — the header card renders "Case # FTR…"
     * with a space — so this matches the breadcrumb alone and never the header card.
     */
    getBreadcrumbCaseNumber(): Locator {
        return this.page.getByText(/#FTR\d+/).first();
    }

    /** The vehicle banner's "Last Known Mileage" pill (value-dominant). */
    getVehicleMileage(): Locator {
        return this.page.getByText(/Last Known Mileage/i).first();
    }

    /**
     * The `<strong>` label node inside a header field (Case # / Status / Case Type). Used to
     * measure the label so only the value to its right is masked, keeping the label compared.
     */
    getCaseHeaderLabel(label: string): Locator {
        return this.caseHeaderRow()
            .locator('strong')
            .filter({ hasText: this.exact(label) })
            .first();
    }

    /**
     * The `<h6>` label heading inside a section article. Used to measure the label so only the
     * value below it is masked (the label row stays in the visual comparison).
     */
    getSectionArticleHeading(sectionName: string, label: string): Locator {
        return this.getSectionArticle(sectionName, label)
            .getByRole('heading', { name: this.exact(label) })
            .first();
    }
}

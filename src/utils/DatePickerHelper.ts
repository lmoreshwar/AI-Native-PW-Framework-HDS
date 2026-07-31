import { Locator, Page } from '@playwright/test';
import { Logger } from './Logger';

export interface DatePickerOptions {
    timeout?: number;
    closeOverlay?: boolean;
}

/**
 * Central date-picker helper for Angular Material style calendars.
 * Opens the supplied calendar trigger and selects today's date when it is enabled.
 * If today is not available in the visible month, it falls back to the first enabled day.
 */
export class DatePickerHelper {
    private static readonly dateButtonSelector = [
        'button.mat-calendar-body-cell:not([disabled])',
        '.mat-calendar-body-cell button:not([disabled])',
        'td button:not([disabled])[aria-label]',
        '[role="gridcell"] button:not([disabled])',
        'button:not([disabled])[aria-label*="202"]',
    ].join(', ');

    private static readonly calendarOpenSelector = [
        '.mat-datepicker-content',
        '.mat-calendar-content',
        '[role="grid"]',
        'button:not([disabled])[aria-label*="202"]',
        'button:not([disabled])[aria-label*="June"]',
        'button:not([disabled])[aria-label*="July"]',
        'button:not([disabled])[aria-label*="August"]',
    ].join(', ');

    private static readonly overlaySelector =
        '.mat-datepicker-1-backdrop, .cdk-overlay-backdrop.cdk-overlay-backdrop-showing, .cdk-overlay-pane:visible';

    static async selectRandomAvailableDate(
        page: Page,
        calendarTrigger: Locator,
        label: string,
        logger?: Logger,
        options?: DatePickerOptions,
    ): Promise<void> {
        await DatePickerHelper.selectCurrentOrFirstAvailableDate(page, calendarTrigger, label, logger, options);
    }

    static async selectCurrentOrFirstAvailableDate(
        page: Page,
        calendarTrigger: Locator,
        label: string,
        logger?: Logger,
        options?: DatePickerOptions,
    ): Promise<void> {
        const timeout = options?.timeout ?? 15000;

        logger?.info(`Opening calendar for ${label}`);
        await calendarTrigger.waitFor({ state: 'visible', timeout });
        await calendarTrigger.scrollIntoViewIfNeeded({ timeout }).catch(() => null);
        await DatePickerHelper.openCalendar(page, calendarTrigger, label, logger, timeout);

        await page.waitForSelector(DatePickerHelper.dateButtonSelector, { state: 'visible', timeout });

        const selectedDate = await page.evaluate((selector): string | null => {
            const candidates = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
            const enabledDates = candidates.filter((element) => {
                const style = window.getComputedStyle(element);
                const disabled =
                    element.hasAttribute('disabled') ||
                    element.getAttribute('aria-disabled') === 'true' ||
                    element.classList.contains('mat-calendar-body-disabled');
                const visible =
                    style.visibility !== 'hidden' &&
                    style.display !== 'none' &&
                    element.offsetWidth > 0 &&
                    element.offsetHeight > 0;
                return visible && !disabled;
            });

            if (enabledDates.length === 0) {
                return null;
            }

            const today = new Date();
            const currentDay = String(today.getDate());
            const monthName = today.toLocaleString('en-US', { month: 'long' });
            const year = String(today.getFullYear());

            const selected =
                enabledDates.find((element) => {
                    const ariaLabel = element.getAttribute('aria-label') ?? '';
                    const text = element.textContent?.trim() ?? '';
                    return (
                        (ariaLabel.includes(monthName) && ariaLabel.includes(currentDay) && ariaLabel.includes(year)) ||
                        (text === currentDay && element.className.includes('today')) ||
                        element.getAttribute('aria-current') === 'date'
                    );
                }) ?? enabledDates[0];

            const label = selected.getAttribute('aria-label') ?? selected.textContent?.trim() ?? 'available date';
            selected.click();
            return label;
        }, DatePickerHelper.dateButtonSelector);

        if (!selectedDate) {
            throw new Error(`No available date could be selected for ${label}`);
        }

        logger?.info(`Selected date for ${label}: ${selectedDate}`);
        await page.waitForTimeout(400);

        if (options?.closeOverlay !== false) {
            await DatePickerHelper.closeCalendarOverlay(page, logger);
        }
    }

    private static async openCalendar(
        page: Page,
        calendarTrigger: Locator,
        label: string,
        logger?: Logger,
        timeout?: number,
    ): Promise<void> {
        const attempts: Array<() => Promise<void>> = [
            async () => calendarTrigger.click(),
            async () => calendarTrigger.click({ force: true }),
            async () => calendarTrigger.press('Enter'),
            async () => calendarTrigger.press('Space'),
            async () =>
                calendarTrigger.evaluate((element) => {
                    const target = element as HTMLElement;
                    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                    target.click();
                }),
        ];

        for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
            await attempts[attemptIndex]().catch(() => null);
            const opened = await page
                .waitForSelector(DatePickerHelper.calendarOpenSelector, { state: 'visible', timeout: 1500 })
                .then(() => true)
                .catch(() => false);
            if (opened) {
                logger?.info(`Calendar opened for ${label} using attempt ${attemptIndex + 1}`);
                return;
            }
        }

        throw new Error(`Calendar did not open for ${label} within ${timeout ?? 15000}ms`);
    }

    private static async closeCalendarOverlay(page: Page, logger?: Logger): Promise<void> {
        const backdrop = page.locator('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing').first();
        const backdropVisible = await backdrop.isVisible().catch(() => false);
        if (backdropVisible) {
            logger?.info('Calendar backdrop still open — closing it');
            await backdrop.click({ force: true }).catch(() => null);
        }

        await page
            .locator(DatePickerHelper.overlaySelector)
            .first()
            .waitFor({ state: 'hidden', timeout: 10000 })
            .catch(() => null);
    }
}

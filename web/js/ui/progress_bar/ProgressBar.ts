import {Logger} from '../../logger/Logger';
import {Optional} from '../../util/ts/Optional';

const ID = 'polar-progress-bar';

const log = Logger.create();

/**
 * Simple progress bar that we can display at any time on a page without
 * complicated rendering issues or requiring React to be used.  This allows
 * us to easily show a GUI for a download at any point in time.
 */
export class ProgressBar {

    public update(val: number, autoDestroy: boolean = true) {

        if (! val || val < 0) {
            return;
        }

        // FIXME: there is now a bug here where if the ProgressBar is
        // auto-destroyed early, any lagging progress bar values won't get
        // created... we need the ability to auto-create if the value is
        // in the interval [0,100) but destroy it if the value is 100.

        ProgressBar.getProgressElement().map(progressElement => {

            if (progressElement instanceof HTMLProgressElement) {
                progressElement.value = val;
            }

            if (autoDestroy && val >= 100) {
                this.destroy();
            }

        });

    }

    public destroy() {

        const progressElement = ProgressBar.getProgressElement().getOrUndefined();

        if (progressElement) {

            if (progressElement.parentElement !== null) {
                progressElement.parentElement.removeChild(progressElement);
            } else {
                log.warn("No parent element for progress bar.");
            }

        } else {
            // log.warn("No progress bar to destroy.");
        }

    }

    private static getProgressElement(): Optional<HTMLProgressElement> {
        const element = document.getElementById(ID);
        return Optional.of(<HTMLProgressElement> element);
    }

    public static create(indeterminate: boolean = true): ProgressBar {

        const current = this.getProgressElement();

        if (current.isPresent()) {
            return new ProgressBar();
        }

        let element: HTMLElement;

        // TODO: technically there's a bug if we used indeterminate and
        // determinate progress bars but we don't use them overlapping in
        // the same app right now.

        if (indeterminate) {

            element = document.createElement('div');

            element.setAttribute('class', 'progress-indeterminate-slider');

            element.innerHTML = `
                <div class="progress-indeterminate-line"></div>
                <div class="progress-indeterminate-subline progress-indeterminate-inc"></div>
                <div class="progress-indeterminate-subline progress-indeterminate-dec"></div>
            `;

        } else {
            element = document.createElement('progress');
        }

        if (! indeterminate && element instanceof HTMLProgressElement) {
            // set the defaults
            element.value = 0;
            element.max = 100;
        }

        element.id = ID;

        element.style.height = '4px';

        element.style.width = `100%`;

        /// progress.style.backgroundColor='#89ADFD';
        // progress.style.color='#89ADFD';
        element.style.position = 'fixed';
        element.style.top = '0';
        element.style.left = '0';
        element.style.zIndex = '99999999999';
        element.style.borderTop = '0';
        element.style.borderLeft = '0';
        element.style.borderRight = '0';
        element.style.borderBottom = '0';
        // element.style.webkitAppearance = 'none';
        // element.style.borderRadius = '0';

        document.body.appendChild(element);

        return new ProgressBar();

    }

}


import {DocFormat, DocFormatName, PageDetail} from './DocFormat';
import {notNull} from '../Preconditions';
import {Optional} from '../util/ts/Optional';

export class HTMLFormat extends DocFormat {

    public readonly name = 'html';

    constructor() {
        super();
    }

    /**
     * Get all the metadata about the current page.
     */
    public getCurrentPageDetail(): PageDetail {

        const pageElement = notNull(this.getCurrentPageElement());
        const pageNum = this.getPageNumFromPageElement(pageElement);

        const dimensions = {
            width: pageElement.offsetWidth,
            height: pageElement.offsetHeight
        };

        return { pageElement, pageNum, dimensions };

    }

    /**
     * Get the current doc fingerprint or null if it hasn't been loaded yet.
     */
    currentDocFingerprint(): string | undefined {

        let polarFingerprint = this._queryFingerprintElement();

        if (polarFingerprint !== null) {
            return Optional.of(polarFingerprint.getAttribute("content")!).getOrUndefined();
        }

        return undefined;

    }

    setCurrentDocFingerprint(fingerprint: string) {
        let polarFingerprint = this._queryFingerprintElement();
        polarFingerprint.setAttribute("content", fingerprint);
    }

    _queryFingerprintElement(): Element {
        return notNull(document.querySelector("meta[name='polar-fingerprint']"));
    }

    /**
     * Get the current state of the doc.
     */
    public currentState() {

        return {
            nrPages: 1,
            currentPageNumber: 1,
        };

    }

    textHighlightOptions() {
        return {
        };
    }

    currentScale() {

        return Optional.of(document.querySelector("meta[name='polar-scale']"))
            .map(current => current.getAttribute('content'))
            .map(current => parseFloat(current))
            .get();

        /*
        let select = document.querySelector("select");
        let value = select.options[select.selectedIndex].value;

        if(!value) {
            throw new Error("No scale value");
        }

        let result = parseInt(value);

        if(isNaN(result)) {
            throw new Error("Not a number from: " + value);
        }

        if(result <= 0) {
            throw new Error("Scale is too small: " + result);
        }

        return result;
        */

    }

    targetDocument(): HTMLDocument | null {
        return Optional.of(document.querySelector("iframe")).get().contentDocument;
    }

}

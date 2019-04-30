import {Logger} from "../../../../logger/Logger";

import {DocFormatFactory} from "../../../../docformat/DocFormatFactory";
import {Component} from "../../../../components/Component";
import {forDict} from "../../../../util/Functions";
import {Rects} from "../../../../Rects";
import {Dimensions} from "../../../../util/Dimensions";
import {AreaHighlight} from "../../../../metadata/AreaHighlight";
import {AreaHighlights} from "../../../../metadata/AreaHighlights";
import {AnnotationRect} from "../../../../metadata/AnnotationRect";
import {AnnotationRects} from "../../../../metadata/AnnotationRects";
import {AreaHighlightRect} from "../../../../metadata/AreaHighlightRect";
import {AreaHighlightRects} from "../../../../metadata/AreaHighlightRects";
import {BoxController} from "../../../../boxes/controller/BoxController";
import {BoxOptions} from "../../../../boxes/controller/BoxOptions";
import {DocFormat} from "../../../../docformat/DocFormat";
import {AnnotationEvent} from '../../../../annotations/components/AnnotationEvent';
import {BoxMoveEvent} from '../../../../boxes/controller/BoxMoveEvent';

const log = Logger.create();

export class AreaHighlightComponent extends Component {

    private readonly docFormat: DocFormat;

    private annotationEvent?: AnnotationEvent;
    private areaHighlight?: AreaHighlight;
    private boxController?: BoxController;

    constructor() {
        super();

        this.docFormat = DocFormatFactory.getInstance();

    }

    /**
     * @Override
     */
    public init(annotationEvent: AnnotationEvent) {

        // TODO: we should a specific event class for this data which is
        // captured within a higher level annotationEvent.
        this.annotationEvent = annotationEvent;
        this.areaHighlight = annotationEvent.value;

        this.boxController = new BoxController(boxMoveEvent => this.onBoxMoved(boxMoveEvent));

    }

    /**
     *
     */
    private onBoxMoved(boxMoveEvent: BoxMoveEvent) {

        // TODO: actually I think this belongs in the controller... not the view

        // TODO: refactor / this code is shared with the
        // AbstractPagemarkComponent

        // console.log("Box moved to: ", boxMoveEvent);

        const annotationRect = AnnotationRects.createFromPositionedRect(boxMoveEvent.boxRect,
                                                                      boxMoveEvent.restrictionRect);

        const areaHighlightRect = new AreaHighlightRect(annotationRect);

        // FIXME: the lastUpdated here isn't being updated. I'm going to
        // have to change the setters I think..

        if (boxMoveEvent.state === "completed") {

            const annotationEvent = this.annotationEvent!;

            // TODO: this isn't handled properly because we create a NEW rect
            // with the existing values...

            this.areaHighlight = new AreaHighlight(this.areaHighlight);
            this.areaHighlight.rects["0"] = <any> areaHighlightRect;

            log.debug("New areaHighlight: ", JSON.stringify(this.areaHighlight, null, "  "));

            delete annotationEvent.pageMeta.areaHighlights[this.areaHighlight.id];
            annotationEvent.pageMeta.areaHighlights[this.areaHighlight.id] = this.areaHighlight;

        } else {
            // noop
        }

    }

    /**
     * @Override
     */
    public render() {

        this.destroy();

        const annotationEvent = this.annotationEvent!;
        const areaHighlight = this.areaHighlight!;
        const boxController = this.boxController!;

        log.debug("render()");

        const docMeta = annotationEvent.docMeta;
        const pageMeta = annotationEvent.pageMeta;
        const docInfo = docMeta.docInfo;

        const pageElement = this.docFormat.getPageElementFromPageNum(pageMeta.pageInfo.num);
        const dimensionsElement = pageElement.querySelector(".canvasWrapper, .iframeWrapper")!;

        // the container must ALWAYS be the pageElement because if we use any
        // other container PDF.js breaks.
        const containerElement = pageElement;

        const pageDimensions = new Dimensions({
            width: dimensionsElement.clientWidth,
            height: dimensionsElement.clientHeight
        });

        forDict(areaHighlight.rects, (key, rect) => {

            const areaHighlightRect = AreaHighlightRects.createFromRect(rect);

            const overlayRect = areaHighlightRect.toDimensions(pageDimensions);

            log.debug("Rendering annotation at: " + JSON.stringify(overlayRect, null, "  "));

            const id = this.createID();

            let highlightElement = document.getElementById(id);

            if (highlightElement === null ) {

                // only create the pagemark if it's missing.
                highlightElement = document.createElement("div");
                highlightElement.setAttribute("id", id);

                containerElement.insertBefore(highlightElement, containerElement.firstChild);

                log.debug("Creating box controller for highlightElement: ", highlightElement);

                boxController.register(new BoxOptions({
                    target: highlightElement,
                    restrictionElement: dimensionsElement,
                    intersectedElementsSelector: ".area-highlight"
                }));

            }

            // TODO: a lot of this code is shared with pagemarks.

            highlightElement.setAttribute("data-type", "area-highlight");
            highlightElement.setAttribute("data-doc-fingerprint", docInfo.fingerprint);
            highlightElement.setAttribute("data-area-highlight-id", areaHighlight.id);
            highlightElement.setAttribute("data-annotation-id", areaHighlight.id);
            highlightElement.setAttribute("data-page-num", `${pageMeta.pageInfo.num}`);

            // annotation descriptor metadata.
            highlightElement.setAttribute("data-annotation-type", "area-highlight");
            highlightElement.setAttribute("data-annotation-id", areaHighlight.id);
            highlightElement.setAttribute("data-annotation-page-num", `${pageMeta.pageInfo.num}`);
            highlightElement.setAttribute("data-annotation-doc-fingerprint", docInfo.fingerprint);

            highlightElement.className = `area-highlight annotation area-highlight-${areaHighlight.id}`;

            highlightElement.style.position = "absolute";
            highlightElement.style.backgroundColor = `yellow`;
            highlightElement.style.opacity = `0.5`;

            // if(this.docFormat.name === "pdf") {
            //     // this is only needed for PDF and we might be able to use a
            // transform // in the future which would be easier. let
            // currentScale = this.docFormat.currentScale(); overlayRect =
            // Rects.scale(overlayRect, currentScale); }

            highlightElement.style.left = `${overlayRect.left}px`;
            highlightElement.style.top = `${overlayRect.top}px`;

            highlightElement.style.width = `${overlayRect.width}px`;
            highlightElement.style.height = `${overlayRect.height}px`;

            highlightElement.style.border = `1px solid #c6c6c6`;

            highlightElement.style.zIndex = '1';

            (highlightElement.style as any).mixBlendMode = 'multiply';

        });

    }

    /**
     * Create a unique DOM ID for this pagemark.
     */
    private createID() {
        return `area-highlight-${this.areaHighlight!.id}`;
    }

    /**
     * @Override
     */
    public destroy() {

        const selector = `.area-highlight-${this.areaHighlight!.id}`;
        const elements = document.querySelectorAll(selector);

        log.debug(`Found N elements for selector ${selector}: ` + elements.length);

        elements.forEach(highlightElement => {
            highlightElement.parentElement!.removeChild(highlightElement);
        });

    }

}

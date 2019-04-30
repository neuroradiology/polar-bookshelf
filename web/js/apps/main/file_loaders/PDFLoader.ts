import {FileLoader} from './FileLoader';
import {WebResource} from '../../../electron/webresource/WebResource';
import {FileRegistry} from '../../../backend/webserver/FileRegistry';
import {ResourcePaths} from '../../../electron/webresource/ResourcePaths';
import {LoadedFile} from './LoadedFile';
import {Logger} from '../../../logger/Logger';
import {FilePaths} from '../../../util/FilePaths';

const log = Logger.create();

export class PDFLoader extends FileLoader {

    private readonly fileRegistry: FileRegistry;

    constructor(fileRegistry: FileRegistry) {
        super();
        this.fileRegistry = fileRegistry;
    }

    public async registerForLoad(path: string): Promise<LoadedFile> {

        const filename = FilePaths.basename(path);

        const fileMeta = this.fileRegistry.registerFile(path);

        const appURL = PDFLoader.createViewerURL(fileMeta.url, filename);

        return {
            webResource: WebResource.createURL(appURL)
        };

    }

    public static createViewerURL(fileURL: string, filename: string) {
        const fileParam = encodeURIComponent(fileURL);
        const filenameParam = encodeURIComponent(filename);

        return ResourcePaths.resourceURLFromRelativeURL(`/pdfviewer/web/index.html?file=${fileParam}&filename=${filenameParam}&zoom=page-width`, false);
    }

}


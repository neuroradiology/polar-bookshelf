import {Blobs} from './Blobs';
import {ArrayBuffers} from './ArrayBuffers';
import {Strings} from './Strings';
import {URLStr} from './Strings';

// import fetch from './Fetch';

export class URLs {

    public static async toBuffer(url: URLStr): Promise<Buffer> {

        const response = await fetch(url);
        const blob = await response.blob();
        const arrayBuffer = await Blobs.toArrayBuffer(blob);
        return ArrayBuffers.toBuffer(arrayBuffer);

    }

    public static async toBlob(url: URLStr): Promise<Blob> {

        const response = await fetch(url);

        if (response.ok) {
            return await response.blob();
        } else {
            throw new Error(`Could not fetch URL ${response.status}: ${response.statusText}`);
        }

    }

    /**
     * Return true if the URL is a web scheme (http or https)
     * @param url
     */
    public static isWebScheme(url: URLStr) {

        return url.startsWith('http:') || url.startsWith('https:');

    }

    /**
     * Get the site base URL including the scheme, domain, and optionally the
     * port.
     */
    public static toBase(url: URLStr) {

        const parsedURL = new URL(url);

        const protocol = parsedURL.protocol;
        const hostname = parsedURL.hostname;
        const port = ! Strings.empty(parsedURL.port) ? `:${parsedURL.port}` : '';

        return `${protocol}//${hostname}${port}`;

    }

    public static absolute(url: string, base: string) {
        return new URL(url, base).toString();
    }

    /**
     * Return true if this is a URL
     */
    public static isURL(path: string) {

        if (!path) {
            return false;
        }

        return path.startsWith("file:") ||
            path.startsWith("blob:") ||
            path.startsWith("http:") ||
            path.startsWith("https:");

    }

    /**
     * Return true if the given URL exists by performing a HEAD request on it.
     */
    public static async existsWithHEAD(url: URLStr): Promise<boolean> {
        const response = await fetch(url, {method: 'HEAD'});
        return response.ok;
    }

    /**
     * Test if a file exists by performing a range request on it for zero bytes.
     */
    public static async existsWithGETUsingRange(url: URLStr): Promise<boolean> {

        const headers = {
            Range: "bytes=0-0"
        };

        const response = await fetch(url, {method: 'HEAD', headers});
        return response.ok;

    }

}

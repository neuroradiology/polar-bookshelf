import {isPresent, Preconditions} from '../../../web/js/Preconditions';
import {IDocInfo} from '../../../web/js/metadata/DocInfo';
import {Optional} from '../../../web/js/util/ts/Optional';
import {RepoDocInfo} from './RepoDocInfo';
import {ISODateTimeString} from '../../../web/js/metadata/ISODateTimeStrings';
import {DocInfos} from '../../../web/js/metadata/DocInfos';

export class RepoDocInfos {

    public static isValid(repoDocInfo: RepoDocInfo) {
        return isPresent(repoDocInfo.filename);
    }

    public static convert(docInfo: IDocInfo): RepoDocInfo {

        Preconditions.assertPresent(docInfo, "docInfo");

        return {

            fingerprint: docInfo.fingerprint,

            // TODO: we should map this to also filter out '' and ' '
            // from the list of strings.
            title: DocInfos.bestTitle(docInfo),

            progress: Optional.of(docInfo.progress)
                .validateNumber()
                .getOrElse(0),

            filename: Optional.of(docInfo.filename)
                .validateString()
                .getOrUndefined(),

            added: Optional.of(docInfo.added)
                .map(current => this.toISODateTimeString(current))
                .validateString()
                .getOrUndefined(),

            lastUpdated: Optional.of(docInfo.lastUpdated)
                .map(current => this.toISODateTimeString(current))
                .validateString()
                .getOrUndefined(),

            flagged: Optional.of(docInfo.flagged)
                .validateBoolean()
                .getOrElse(false),

            archived: Optional.of(docInfo.archived)
                .validateBoolean()
                .getOrElse(false),

            tags: Optional.of(docInfo.tags)
                .getOrElse({}),

            site: Optional.of(docInfo.url)
                .map(url => new URL(url).hostname)
                .getOrUndefined(),

            url: docInfo.url,

            nrAnnotations: Optional.of(docInfo.nrAnnotations)
                .getOrElse(0),

            hashcode: docInfo.hashcode,

            docInfo

        };

    }

    private static toISODateTimeString(current: string) {


        // this is a pragmatic workaround for JSON
        // serialization issues with typescript.

        if ( typeof current === 'object') {

            // this is a bug fix/workaround for corrupt stores that
            // accidentally had and ISODateTime stored in them.

            const obj = <any> current;

            if (isPresent(obj.value) && typeof obj.value === 'string') {
                return obj.value;
            }

        }

        return current;

    }

}

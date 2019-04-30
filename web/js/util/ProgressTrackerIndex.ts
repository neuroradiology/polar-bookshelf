import {Progress} from "./ProgressTracker";
import {isPresent} from '../Preconditions';
import {Reducers} from "./Reducers";
import {Optional} from "./ts/Optional";

export class ProgressTrackerIndex {

    private index: { [key: number]: Progress } = {};

    public update(progress: Progress) {

        if (! isPresent(progress.progress)) {
            return;
        }

        if (progress.progress === 100) {
            delete this.index[progress.task];
        } else {
            this.index[progress.task] = progress;
        }

    }

    public min(defaultValue: number = 100): Optional<Progress> {

        if (Object.keys(this.index).length === 0) {
            // no entries so we're done.
            return Optional.empty();

        }

        return Optional.of(Object.values(this.index)
                               .sort((a, b) => a.progress - b.progress)
                               .reduce(Reducers.FIRST));

    }

}



import {Preconditions} from '../Preconditions';
import {Optional} from './ts/Optional';
import {IArrayPosition} from './Functions';

export class Tuples {

    /**
     * Go over the array-like object and return tuples with prev, curr, and next
     * properties so that we can peek at siblings easily.  If the prev and / or
     * next are not present these values are null.
     *
     * This can be used for algorithms that need to peek ahead or behind
     * inside an iterative algorithm
     *
     */
    public static createSiblings<T>(arr: ReadonlyArray<T>) {

        Preconditions.assertNotNull(arr, "arr");

        const result: Array<IArrayElement<T>> = [];

        for (let idx = 0; idx < arr.length; ++idx) {

            result.push({
                curr: arr[idx],
                prev: Optional.of(arr[idx - 1]).getOrUndefined(),
                next: Optional.of(arr[idx + 1]).getOrUndefined()
            });

        }

        return result;

    }

}

/**
 * Represents a 'position' object for createSiblings() that has a curr
 * (current), prev (previous), and next references for working with lists of
 * objects.  The position allow sus to know where we currently are but also the
 * previous and future states.
 */
export interface IArrayElement<T> {

    readonly prev?: T;

    readonly curr: T;

    readonly next?: T;

}

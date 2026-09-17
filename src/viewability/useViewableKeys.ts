import { useRef, useState } from 'react';
import { sameKeySet, type Key } from '../utils/keys';
import { useLatest } from '../utils/useLatest';

/** Structural subset of FlatList's and FlashList's ViewToken. */
export interface ViewableItem<T> {
	item: T;
	index: number | null;
	isViewable: boolean;
}

export interface ViewableItemsChangedInfo<T> {
	viewableItems: ViewableItem<T>[];
	changed?: ViewableItem<T>[];
}

export interface UseViewableKeysOptions<T, K extends Key> {
	keyExtractor: (item: T, index: number) => K;
	/**
	 * Keep the last non-empty set when the list reports no viewable items,
	 * e.g. while a dataset is being swapped. Defaults to false.
	 */
	ignoreEmpty?: boolean;
	onChange?: (keys: readonly K[]) => void;
}

export interface ViewableKeys<T, K extends Key> {
	/** Keys of the currently viewable rows. Same reference while the set is unchanged. */
	viewableKeys: readonly K[];
	/** Stable callback to pass to FlatList/FlashList `onViewableItemsChanged`. */
	onViewableItemsChanged: (info: ViewableItemsChangedInfo<T>) => void;
}

const EMPTY: readonly never[] = [];

/**
 * Tracks which row keys are on screen. The returned callback never changes
 * identity (FlatList forbids swapping `onViewableItemsChanged` after mount)
 * and the key set only updates when its contents change.
 */
export function useViewableKeys<T, K extends Key = Key>({
	keyExtractor,
	ignoreEmpty = false,
	onChange,
}: UseViewableKeysOptions<T, K>): ViewableKeys<T, K> {
	const [viewableKeys, setViewableKeys] = useState<readonly K[]>(EMPTY);
	const keyExtractorRef = useLatest(keyExtractor);
	const ignoreEmptyRef = useLatest(ignoreEmpty);
	const onChangeRef = useLatest(onChange);
	const latestRef = useRef<readonly K[]>(EMPTY);

	const handlerRef = useRef<ViewableKeys<T, K>['onViewableItemsChanged']>(null);
	if (handlerRef.current === null) {
		handlerRef.current = ({ viewableItems }) => {
			const keys: K[] = [];
			for (const token of viewableItems) {
				if (!token.isViewable) continue;
				keys.push(keyExtractorRef.current(token.item, token.index ?? -1));
			}
			if (keys.length === 0 && ignoreEmptyRef.current) return;
			if (sameKeySet(keys, latestRef.current)) return;
			latestRef.current = keys;
			setViewableKeys(keys);
			onChangeRef.current?.(keys);
		};
	}

	return { viewableKeys, onViewableItemsChanged: handlerRef.current };
}

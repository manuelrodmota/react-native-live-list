import { act, renderHook } from '@testing-library/react-native';
import { useViewableKeys, type ViewableItem } from '../useViewableKeys';

type Row = { id: number; title: string };

const token = (id: number, isViewable = true): ViewableItem<Row> => ({
	item: { id, title: `Row ${id}` },
	index: id,
	isViewable,
});

describe('useViewableKeys', () => {
	it('keeps the same callback identity across renders', () => {
		const { result, rerender } = renderHook(() =>
			useViewableKeys<Row, number>({ keyExtractor: (row) => row.id }),
		);
		const first = result.current.onViewableItemsChanged;
		rerender({});
		expect(result.current.onViewableItemsChanged).toBe(first);
	});

	it('reports the keys of viewable rows only', () => {
		const onChange = jest.fn();
		const { result } = renderHook(() =>
			useViewableKeys<Row, number>({
				keyExtractor: (row) => row.id,
				onChange,
			}),
		);
		expect(result.current.viewableKeys).toEqual([]);

		act(() => {
			result.current.onViewableItemsChanged({
				viewableItems: [token(1), token(2), token(3, false)],
			});
		});
		expect(result.current.viewableKeys).toEqual([1, 2]);
		expect(onChange).toHaveBeenCalledWith([1, 2]);
	});

	it('ignores updates that do not change the set', () => {
		const onChange = jest.fn();
		let renders = 0;
		const { result } = renderHook(() => {
			renders += 1;
			return useViewableKeys<Row, number>({
				keyExtractor: (row) => row.id,
				onChange,
			});
		});
		act(() => {
			result.current.onViewableItemsChanged({
				viewableItems: [token(1), token(2)],
			});
		});
		const keys = result.current.viewableKeys;
		const rendersAfterFirst = renders;

		act(() => {
			result.current.onViewableItemsChanged({
				viewableItems: [token(2), token(1)],
			});
		});
		expect(result.current.viewableKeys).toBe(keys);
		expect(renders).toBe(rendersAfterFirst);
		expect(onChange).toHaveBeenCalledTimes(1);

		act(() => {
			result.current.onViewableItemsChanged({
				viewableItems: [token(2), token(3)],
			});
		});
		expect(result.current.viewableKeys).toEqual([2, 3]);
		expect(onChange).toHaveBeenCalledTimes(2);
	});

	it('uses the latest keyExtractor', () => {
		const { result, rerender } = renderHook(
			({ prefix }: { prefix: string }) =>
				useViewableKeys<Row, string>({
					keyExtractor: (row) => `${prefix}-${row.id}`,
				}),
			{ initialProps: { prefix: 'a' } },
		);
		rerender({ prefix: 'b' });
		act(() => {
			result.current.onViewableItemsChanged({ viewableItems: [token(1)] });
		});
		expect(result.current.viewableKeys).toEqual(['b-1']);
	});

	it('optionally keeps the last set when the list reports nothing viewable', () => {
		const { result } = renderHook(() =>
			useViewableKeys<Row, number>({
				keyExtractor: (row) => row.id,
				ignoreEmpty: true,
			}),
		);
		act(() => {
			result.current.onViewableItemsChanged({ viewableItems: [token(1)] });
		});
		act(() => {
			result.current.onViewableItemsChanged({ viewableItems: [] });
		});
		expect(result.current.viewableKeys).toEqual([1]);
	});

	it('clears the set on empty by default', () => {
		const { result } = renderHook(() =>
			useViewableKeys<Row, number>({ keyExtractor: (row) => row.id }),
		);
		act(() => {
			result.current.onViewableItemsChanged({ viewableItems: [token(1)] });
		});
		act(() => {
			result.current.onViewableItemsChanged({ viewableItems: [] });
		});
		expect(result.current.viewableKeys).toEqual([]);
	});
});

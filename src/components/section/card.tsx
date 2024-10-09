import type { NewsItem, SourceID, SourceInfo, SourceResponse } from "@shared/types"
import { OverlayScrollbarsComponent } from "overlayscrollbars-react"
import type { UseQueryResult } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import clsx from "clsx"
import { useInView } from "react-intersection-observer"
import { useAtom } from "jotai"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { sources } from "@shared/sources"
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities"
import { ofetch } from "ofetch"
import { focusSourcesAtom, refetchSourcesAtom } from "~/atoms"
import { useRelativeTime } from "~/hooks/useRelativeTime"

export interface ItemsProps extends React.HTMLAttributes<HTMLDivElement> {
  id: SourceID
  /**
   * 是否显示透明度，拖动时原卡片的样式
   */
  isDragged?: boolean
  isOverlay?: boolean
  handleListeners?: SyntheticListenerMap
}

interface NewsCardProps {
  id: SourceID
  inView: boolean
  isOverlay?: boolean
  handleListeners?: SyntheticListenerMap
}

interface Query {
  query: UseQueryResult<SourceInfo, Error>
}

export const CardWrapper = forwardRef<HTMLDivElement, ItemsProps>(({ id, isDragged, isOverlay, handleListeners, style, ...props }, dndRef) => {
  const ref = useRef<HTMLDivElement>(null)
  const { ref: inViewRef, inView } = useInView({
    threshold: 0,
  })

  useImperativeHandle(dndRef, () => ref.current!)
  useImperativeHandle(inViewRef, () => ref.current!)

  return (
    <div
      ref={ref}
      className={clsx(
        "flex flex-col h-500px aspect-auto border border-gray-100 rounded-xl shadow-2xl shadow-gray-600/10 bg-base dark:( border-gray-700 shadow-none)",
        isDragged && "op-50",
        isOverlay ? "bg-glass" : "",
      )}
      style={{
        transformOrigin: "50% 50%",
        ...style,
      }}
      {...props}
    >
      <NewsCard id={id} inView={inView} isOverlay={isOverlay} handleListeners={handleListeners} />
    </div>
  )
})

export function NewsCard({ id, inView, isOverlay, handleListeners }: NewsCardProps) {
  const [focusSources, setFocusSources] = useAtom(focusSourcesAtom)
  const [refetchSource, setRefetchSource] = useAtom(refetchSourcesAtom)
  const query = useQuery({
    queryKey: [id, refetchSource[id]],
    queryFn: async ({ queryKey }) => {
      const [_id, _refetchTime] = queryKey as [SourceID, number]
      let url = `/api/${_id}`
      if (Date.now() - _refetchTime < 1000) {
        url = `/api/${_id}?latest`
      }
      const response: SourceResponse = await ofetch(url, { timeout: 5000 })
      if (response.status === "error") {
        throw new Error(response.message)
      } else {
        return response.data
      }
    },
    // refetch 时显示原有的数据
    placeholderData: prev => prev,
    staleTime: 1000 * 60 * 5,
    enabled: inView,
  })

  const addFocusList = useCallback(() => {
    setFocusSources(focusSources.includes(id) ? focusSources.filter(i => i !== id) : [...focusSources, id])
  }, [setFocusSources, focusSources, id])
  const manualRefetch = useCallback(() => {
    setRefetchSource(prev => ({
      ...prev,
      [id]: Date.now(),
    }))
  }, [setRefetchSource, id])

  return (
    <>
      <div
        {...handleListeners}
        className={clsx([
          "flex justify-between p-2 items-center",
          handleListeners && "cursor-grab",
          isOverlay && "cursor-grabbing",
        ])}
      >
        <div className="flex items-center gap-2">
          <img src={`/icons/${id.split("-")[0]}.png`} className="w-4 h-4 rounded" alt={id} onError={e => e.currentTarget.hidden = true} />
          <span className="text-md font-bold">
            {sources[id].name}
          </span>
        </div>
        <span className="text-xs">{sources[id]?.title}</span>
      </div>
      <OverlayScrollbarsComponent
        defer
        className="h-full pl-2 pr-3 mr-1"
        element="div"
        options={{ scrollbars: { autoHide: "scroll" }, overflow: { x: "hidden" } }}
      >
        <NewsList query={query} />
      </OverlayScrollbarsComponent>
      <div className="p-2 flex items-center justify-between">
        <UpdateTime query={query} />
        <div className="flex gap-1">
          <button
            type="button"
            className={clsx("i-ph:arrow-clockwise", query.isFetching && "animate-spin")}
            onClick={manualRefetch}
          />
          <button type="button" className={clsx(focusSources.includes(id) ? "i-ph:star-fill" : "i-ph:star", "color-primary")} onClick={addFocusList} />
        </div>
      </div>
    </>
  )
}

function UpdateTime({ query }: Query) {
  const updatedTime = useRelativeTime(query.data?.updatedTime ?? "")
  if (updatedTime) return <span>{`${updatedTime}更新`}</span>
  if (query.isError) return <span>获取失败</span>
  return <span className="skeleton w-20" />
}

function Num({ num }: { num: number }) {
  const color = ["bg-red-900", "bg-red-500", "bg-red-400"]
  return (
    <span className={clsx("bg-active min-w-6 flex justify-center items-center rounded-md", false && color[num - 1])}>
      {num}
    </span>
  )
}

function ExtraInfo({ item }: { item: NewsItem }) {
  const relativeTime = useRelativeTime(item?.extra?.date)
  if (item?.extra?.info) {
    return <>{item.extra.info}</>
  }

  if (item?.extra?.icon) {
    return <img src={item.extra.icon} className="w-5 inline" />
  }

  if (relativeTime) {
    return <>{relativeTime}</>
  }
}

function NewsList({ query }: Query) {
  const items = query.data?.items
  if (items?.length) {
    return (
      <>
        {items.slice(0, 20).map((item, i) => (
          <div key={item.title} className="flex gap-2 items-center">
            <Num num={i + 1} />
            <a href={item.url} target="_blank" className="my-1">
              <span className="mr-2">
                {item.title}
              </span>
              <span className="text-xs text-gray-4/80 truncate align-middle">
                <ExtraInfo item={item} />
              </span>
            </a>
          </div>
        ))}
      </>
    )
  }
  return (
    <>
      {Array.from({ length: 20 }).map((_, i) => i).map(i => (
        <div key={i} className="flex gap-2 items-center">
          <Num num={i + 1} />
          <span className="skeleton border-b border-gray-300/20 my-1"></span>
        </div>
      ))}
    </>
  )
}
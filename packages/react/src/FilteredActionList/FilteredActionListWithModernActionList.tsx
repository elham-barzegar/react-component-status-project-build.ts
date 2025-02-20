import type {ScrollIntoViewOptions} from '@primer/behaviors'
import {scrollIntoView, FocusKeys} from '@primer/behaviors'
import type {KeyboardEventHandler} from 'react'
import React, {useCallback, useEffect, useRef} from 'react'
import styled from 'styled-components'
import Box from '../Box'
import Spinner from '../Spinner'
import type {TextInputProps} from '../TextInput'
import TextInput from '../TextInput'
import {get} from '../constants'
import {ActionList} from '../ActionList'
import type {GroupedListProps, ListPropsBase, ItemInput} from '../SelectPanel/types'
import {useFocusZone} from '../hooks/useFocusZone'
import {useId} from '../hooks/useId'
import {useProvidedRefOrCreate} from '../hooks/useProvidedRefOrCreate'
import {useProvidedStateOrCreate} from '../hooks/useProvidedStateOrCreate'
import useScrollFlash from '../hooks/useScrollFlash'
import {VisuallyHidden} from '../VisuallyHidden'
import type {SxProp} from '../sx'

import {isValidElementType} from 'react-is'
import type {RenderItemFn} from '../deprecated/ActionList/List'
import {useAnnouncements} from './useAnnouncements'

const menuScrollMargins: ScrollIntoViewOptions = {startMargin: 0, endMargin: 8}

export interface FilteredActionListProps
  extends Partial<Omit<GroupedListProps, keyof ListPropsBase>>,
    ListPropsBase,
    SxProp {
  loading?: boolean
  placeholderText?: string
  filterValue?: string
  onFilterChange: (value: string, e: React.ChangeEvent<HTMLInputElement>) => void
  textInputProps?: Partial<Omit<TextInputProps, 'onChange'>>
  inputRef?: React.RefObject<HTMLInputElement>
}

const StyledHeader = styled.div`
  box-shadow: 0 1px 0 ${get('colors.border.default')};
  z-index: 1;
`

export function FilteredActionList({
  loading = false,
  placeholderText,
  filterValue: externalFilterValue,
  onFilterChange,
  items,
  textInputProps,
  inputRef: providedInputRef,
  sx,
  groupMetadata,
  showItemDividers,
  ...listProps
}: FilteredActionListProps): JSX.Element {
  const [filterValue, setInternalFilterValue] = useProvidedStateOrCreate(externalFilterValue, undefined, '')
  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      onFilterChange(value, e)
      setInternalFilterValue(value)
    },
    [onFilterChange, setInternalFilterValue],
  )

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const listContainerRef = useRef<HTMLUListElement>(null)
  const inputRef = useProvidedRefOrCreate<HTMLInputElement>(providedInputRef)
  const activeDescendantRef = useRef<HTMLElement>()
  const listId = useId()
  const inputDescriptionTextId = useId()
  const onInputKeyPress: KeyboardEventHandler = useCallback(
    event => {
      if (event.key === 'Enter' && activeDescendantRef.current) {
        event.preventDefault()
        event.nativeEvent.stopImmediatePropagation()

        // Forward Enter key press to active descendant so that item gets activated
        const activeDescendantEvent = new KeyboardEvent(event.type, event.nativeEvent)
        activeDescendantRef.current.dispatchEvent(activeDescendantEvent)
      }
    },
    [activeDescendantRef],
  )

  useFocusZone(
    {
      containerRef: listContainerRef,
      bindKeys: FocusKeys.ArrowVertical | FocusKeys.PageUpDown,
      focusOutBehavior: 'wrap',
      focusableElementFilter: element => {
        return !(element instanceof HTMLInputElement)
      },
      activeDescendantFocus: inputRef,
      onActiveDescendantChanged: (current, previous, directlyActivated) => {
        activeDescendantRef.current = current

        if (current && scrollContainerRef.current && directlyActivated) {
          scrollIntoView(current, scrollContainerRef.current, menuScrollMargins)
        }
      },
    },
    [
      // List ref isn't set while loading.  Need to re-bind focus zone when it changes
      loading,
    ],
  )

  useEffect(() => {
    // if items changed, we want to instantly move active descendant into view
    if (activeDescendantRef.current && scrollContainerRef.current) {
      scrollIntoView(activeDescendantRef.current, scrollContainerRef.current, {...menuScrollMargins, behavior: 'auto'})
    }
  }, [items])

  useScrollFlash(scrollContainerRef)
  useAnnouncements(items, listContainerRef, inputRef)

  function getItemListForEachGroup(groupId: string) {
    const itemsInGroup = []
    for (const item of items) {
      // Look up the group associated with the current item.
      if (item.groupId === groupId) {
        itemsInGroup.push(item)
      }
    }
    return itemsInGroup
  }

  return (
    <Box display="flex" flexDirection="column" overflow="hidden" sx={sx}>
      <StyledHeader>
        <TextInput
          ref={inputRef}
          block
          width="auto"
          color="fg.default"
          value={filterValue}
          onChange={onInputChange}
          onKeyPress={onInputKeyPress}
          placeholder={placeholderText}
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-label={placeholderText}
          aria-describedby={inputDescriptionTextId}
          {...textInputProps}
        />
      </StyledHeader>
      <VisuallyHidden id={inputDescriptionTextId}>Items will be filtered as you type</VisuallyHidden>
      <Box ref={scrollContainerRef} overflow="auto">
        {loading ? (
          <Box width="100%" display="flex" flexDirection="row" justifyContent="center" pt={6} pb={7}>
            <Spinner />
          </Box>
        ) : (
          <ActionList ref={listContainerRef} showDividers={showItemDividers} {...listProps} role="listbox" id={listId}>
            {groupMetadata?.length
              ? groupMetadata.map((group, index) => {
                  return (
                    <ActionList.Group key={index}>
                      <ActionList.GroupHeading variant={group.header?.variant ? group.header.variant : undefined}>
                        {group.header?.title ? group.header.title : `Group ${group.groupId}`}
                      </ActionList.GroupHeading>
                      {getItemListForEachGroup(group.groupId).map((item, index) => {
                        return <MappedActionListItem key={index} {...item} renderItem={listProps.renderItem} />
                      })}
                    </ActionList.Group>
                  )
                })
              : items.map((item, index) => {
                  return <MappedActionListItem key={index} {...item} renderItem={listProps.renderItem} />
                })}
          </ActionList>
        )}
      </Box>
    </Box>
  )
}

function MappedActionListItem(item: ItemInput & {renderItem?: RenderItemFn}) {
  // keep backward compatibility for renderItem
  // escape hatch for custom Item rendering
  if (typeof item.renderItem === 'function') return item.renderItem(item)

  const {
    id,
    description,
    descriptionVariant,
    text,
    trailingVisual: TrailingVisual,
    leadingVisual: LeadingVisual,
    trailingText,
    trailingIcon: TrailingIcon,
    onAction,
    children,
    ...rest
  } = item

  return (
    <ActionList.Item
      role="option"
      // @ts-ignore - for now
      onSelect={(e: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
        if (typeof onAction === 'function')
          onAction(item, e as React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>)
      }}
      data-id={id}
      {...rest}
    >
      {LeadingVisual ? (
        <ActionList.LeadingVisual>
          <LeadingVisual />
        </ActionList.LeadingVisual>
      ) : null}
      {children}
      {text}
      {description ? <ActionList.Description variant={descriptionVariant}>{description}</ActionList.Description> : null}
      {TrailingVisual ? (
        <ActionList.TrailingVisual>
          {typeof TrailingVisual !== 'string' && isValidElementType(TrailingVisual) ? (
            <TrailingVisual />
          ) : (
            TrailingVisual
          )}
        </ActionList.TrailingVisual>
      ) : TrailingIcon || trailingText ? (
        <ActionList.TrailingVisual>
          {trailingText}
          {TrailingIcon && <TrailingIcon />}
        </ActionList.TrailingVisual>
      ) : null}
    </ActionList.Item>
  )
}

FilteredActionList.displayName = 'FilteredActionList'

import { CommandShape } from '@seleniumhq/side-model'
import List from '@mui/material/List'
import { hasID } from 'api/helpers/hasID'
import { CommandsStateShape } from 'api/models/state/command'
import React, { FC, useEffect } from 'react'
import CommandRow from './TestCommandRow'
import EditorToolbar from '../Drawer/EditorToolbar'

export interface CommandListProps {
  activeCommand: string
  activeTest: string
  bottomOffset: number
  commands: CommandShape[]
  commandStates: CommandsStateShape
}

const deleteKeys: KeyboardEvent['key'][] = ['Backspace', 'Delete']
const traverseKeys: KeyboardEvent['key'][] = ['ArrowUp', 'ArrowDown']

const CommandList: FC<CommandListProps> = ({
  activeCommand,
  activeTest,
  bottomOffset,
  commandStates,
  commands,
}) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (deleteKeys.includes(e.key)) {
        window.sideAPI.tests.removeStep(activeTest, activeCommand)
      }
      if (traverseKeys.includes(e.key)) {
        const activeCommandIndex = commands.findIndex(hasID(activeCommand))
        const nextCommandIndex =
          e.key === 'ArrowUp' ? activeCommandIndex - 1 : activeCommandIndex + 1
        const nextCommand = commands[nextCommandIndex]
        if (nextCommand) {
          window.sideAPI.state.setActiveCommand(nextCommand.id)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
  return (
    <List
      dense
      subheader={
        <EditorToolbar
          disableGutters={false}
          sx={{ top: '96px', zIndex: 100 }}
          onAdd={() =>
            window.sideAPI.tests.addStep(
              activeTest,
              Math.max(
                commands.findIndex(({ id }) => id === activeCommand),
                0
              )
            )
          }
          onRemove={
            commands.length > 1
              ? () => window.sideAPI.tests.removeStep(activeTest, activeCommand)
              : undefined
          }
          text="Commands"
        />
      }
      sx={{
        borderColor: 'primary.main',
        marginBottom: `${bottomOffset}px`,
      }}
    >
      {commands.map((command, index) => {
        const { id } = command
        return (
          <CommandRow
            activeTest={activeTest}
            command={command}
            commandState={commandStates[id]}
            key={id}
            index={index}
            selected={id === activeCommand}
          />
        )
      })}
    </List>
  )
}

export default CommandList
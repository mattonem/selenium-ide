// Licensed to the Software Freedom Conservancy (SFC) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The SFC licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { preprocessParameter } from './preprocessor'
import StringEscape from 'js-string-escape'
import doRender from './render'
import find from './find'
import { registerMethod } from './register'

export function emitCommand(command, emitter, variableLookup) {
  if (emitter) {
    return emitter(
      preprocessParameter(
        command.target,
        emitter.targetPreprocessor,
        variableLookup
      ),
      preprocessParameter(
        command.value,
        emitter.valuePreprocessor,
        variableLookup
      )
    )
  }
}

export function emitLocation(location, emitters) {
  if (/^\/\//.test(location)) {
    return emitters.xpath(location)
  }
  const fragments = location.split('=')
  const type = fragments.shift()
  const selector = emitEscapedText(fragments.join('='))
  if (emitters[type]) {
    return emitters[type](selector)
  } else {
    throw new Error(type ? `Unknown locator ${type}` : "Locator can't be empty")
  }
}

export function emitSelection(location, emitters) {
  if (!location) throw new Error(`Location can't be empty`)
  const [type, selector] = location.split('=')
  if (emitters[type] && selector) {
    let result = emitters[type](selector)
    return result
  } else if (!selector) {
    // no selector strategy given, assuming label
    return emitters['label'](type)
  } else {
    throw new Error(`Unknown selection locator ${type}`)
  }
}

export function emitEscapedText(text) {
  return StringEscape(text)
}

async function emitCommands(commands, emitter) {
  const _commands = commands.map(command => {
    return emitter.emit(command)
  })
  const result = await Promise.all(_commands)
  return result
}

async function emitMethod(
  name,
  commands,
  {
    commandPrefixPadding,
    generateMethodDeclaration,
    terminatingKeyword,
    emitter,
  } = {}
) {
  const methodDeclaration = generateMethodDeclaration(name)
  const emittedCommands = await emitCommands(commands, emitter)
  return [
    methodDeclaration,
    emittedCommands
      .join(`\n${commandPrefixPadding}`)
      .replace(/^/, commandPrefixPadding),
    terminatingKeyword,
  ]
}

export function emitOriginTracing(test, { commentPrefix }) {
  let result = []
  result.push(commentPrefix + ` Test name: ${test.name}`)
  result.push(commentPrefix + ' Step # | name | target | value | comment')
  test.commands.forEach((command, index) => {
    result.push(
      commentPrefix +
        ` ${index + 1} | ${command.command} | ${command.target} | ${
          command.value
        } | ${command.comment}`
    )
  })
  return result
}

async function emitTest(
  test,
  tests,
  {
    testLevel,
    commandLevel,
    testDeclaration,
    terminatingKeyword,
    commandPrefixPadding,
    commentPrefix,
    hooks,
    emitter,
    generateMethodDeclaration,
    enableOriginTracing,
    project,
  } = {}
) {
  const render = doRender.bind(this, commandPrefixPadding)
  if (!testLevel) testLevel = 1
  if (!commandLevel) commandLevel = 2
  const methods = find.reusedTestMethods(test, tests)
  for (const method of methods) {
    const result = await emitMethod(method.name, method.commands, {
      emitter,
      commandPrefixPadding,
      generateMethodDeclaration,
      terminatingKeyword,
    })
    await registerMethod(method.name, result, {
      generateMethodDeclaration,
      hooks,
    })
  }
  let result = ''
  result += render(testDeclaration, {
    startingLevel: testLevel,
  })
  result += render(
    await hooks.inEachBegin.emit({ test, tests, project, isOptional: true }),
    {
      startingLevel: commandLevel,
    }
  )
  const emittedCommands = await emitCommands(test.commands, emitter)
  const originTracing = enableOriginTracing
    ? emitOriginTracing(test, { commentPrefix })
    : undefined
  result += render(emittedCommands, {
    startingLevel: commandLevel,
    originTracing,
  })
  result += render(
    await hooks.inEachEnd.emit({ test, tests, project, isOptional: true }),
    {
      startingLevel: commandLevel,
    }
  )
  result += render(terminatingKeyword, { startingLevel: testLevel })
  return result
}

async function emitSuite(
  body,
  tests,
  {
    suiteLevel,
    testLevel,
    commandLevel,
    suiteName,
    suiteDeclaration,
    terminatingKeyword,
    commandPrefixPadding,
    commentPrefix,
    hooks,
    suite,
    project,
  } = {}
) {
  if (!suite) suite = { name: suiteName }
  const render = doRender.bind(this, commandPrefixPadding)
  if (!suiteLevel) {
    suiteLevel = 0
  }
  if (!testLevel) {
    testLevel = 1
  }
  if (!commandLevel) {
    commandLevel = 2
  }
  let result = ''
  result += commentPrefix + ' Generated by Selenium IDE\n'
  result += render(
    await hooks.declareDependencies.emit({ suite, tests, project })
  )
  result += render(suiteDeclaration, { startingLevel: suiteLevel })
  result += render(
    await hooks.declareVariables.emit({ suite, tests, project }),
    {
      startingLevel: testLevel,
    }
  )
  result += render(
    await hooks.beforeAll.emit({ suite, tests, project, isOptional: true }),
    {
      startingLevel: testLevel,
    }
  )
  result += render(await hooks.beforeEach.emit({ suite, tests, project }), {
    startingLevel: testLevel,
  })
  result += render(await hooks.afterEach.emit({ suite, tests, project }), {
    startingLevel: testLevel,
  })
  result += render(
    await hooks.afterAll.emit({ suite, tests, project, isOptional: true }),
    {
      startingLevel: testLevel,
    }
  )
  result += render(
    await hooks.declareMethods.emit({
      suite,
      tests,
      project,
      isOptional: true,
    }),
    {
      startingLevel: testLevel,
    }
  )
  result += body
  result += render(terminatingKeyword, {
    startingLevel: suiteLevel,
  })
  hooks.declareMethods.clearRegister()
  return result
}

export default {
  command: emitCommand,
  commands: emitCommands,
  location: emitLocation,
  method: emitMethod,
  selection: emitSelection,
  suite: emitSuite,
  test: emitTest,
  text: emitEscapedText,
}
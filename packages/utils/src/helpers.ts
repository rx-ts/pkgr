import fs from 'fs'
import path from 'path'

import isGlob from 'is-glob'
import globSync from 'tiny-glob/sync'

import { CWD, EXTENSIONS } from './constants'

export const tryPkg = (pkg: string) => {
  try {
    return require.resolve(pkg)
  } catch {}
}

export const tryRequirePkg = <T>(pkg: string): T | undefined => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return
    return require(pkg)
  } catch {}
}

export const isPkgAvailable = (pkg: string) => !!tryPkg(pkg)

export const isTsAvailable = isPkgAvailable('typescript')

export const isAngularAvailable = isPkgAvailable('@angular/core')

export const isMdxAvailable =
  isPkgAvailable('@mdx/mdx') || isPkgAvailable('@mdx/react')

export const isReactAvailable = isPkgAvailable('react')

export const isSvelteAvailable = isPkgAvailable('svelte')

export const isVueAvailable = isPkgAvailable('vue')

export const tryFile = (filePath?: string[] | string, includeDir = false) => {
  if (typeof filePath === 'string') {
    return fs.existsSync(filePath) &&
      (includeDir || fs.statSync(filePath).isFile())
      ? filePath
      : ''
  }

  for (const file of filePath ?? []) {
    if (tryFile(file, includeDir)) {
      return file
    }
  }

  return ''
}

export const tryExtensions = (filepath: string, extensions = EXTENSIONS) => {
  const ext = [...extensions, ''].find(ext => tryFile(filepath + ext))
  return ext == null ? '' : filepath + ext
}

export const tryGlob = (
  paths: string[],
  options:
    | string
    | {
        absolute?: boolean
        baseDir?: string
      } = {},
) => {
  const { absolute = true, baseDir = CWD } =
    typeof options === 'string' ? { baseDir: options } : options
  return paths.reduce<string[]>(
    (acc, pkg) =>
      [
        ...acc,
        ...(isGlob(pkg)
          ? globSync(pkg, {
              absolute,
              cwd: baseDir,
            })
          : [tryFile(path.resolve(baseDir, pkg), true)]),
      ].filter(Boolean),
    [],
  )
}

export const identify = <T>(
  _: T,
): _ is Exclude<
  T,
  '' | (T extends boolean ? false : boolean) | null | undefined
> => !!_

export const findUp = (searchEntry: string, searchFile = 'package.json') => {
  console.assert(path.isAbsolute(searchEntry))

  if (
    !tryFile(searchEntry, true) ||
    (searchEntry !== CWD && !searchEntry.startsWith(CWD + path.sep))
  ) {
    return ''
  }

  searchEntry = path.resolve(
    fs.statSync(searchEntry).isDirectory()
      ? searchEntry
      : path.resolve(searchEntry, '..'),
  )

  do {
    const searched = tryFile(path.resolve(searchEntry, searchFile))
    if (searched) {
      return searched
    }
    searchEntry = path.resolve(searchEntry, '..')
  } while (searchEntry === CWD || searchEntry.startsWith(CWD + path.sep))

  return ''
}

export const arrayify = <T, R = T extends Array<infer S> ? S : T>(
  ...args: T[]
) =>
  args.reduce<R[]>((arr, curr) => {
    arr.push(...(Array.isArray(curr) ? curr : curr == null ? [] : [curr]))
    return arr
  }, [])

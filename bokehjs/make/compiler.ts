import chalk from "chalk"
import * as ts from "typescript"

import {dirname} from "path"

export type Outputs = Map<string, string>

export interface Failure {
  count: number
  text: string
}

export interface TSOutput {
  outputs?: Outputs
  failure?: Failure
}

const diagnostics_host: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (path) => path,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getNewLine: () => ts.sys.newLine,
}

export function reportDiagnostics(diagnostics: ReadonlyArray<ts.Diagnostic>): Failure {
  const errors = ts.sortAndDeduplicateDiagnostics(diagnostics)
  const text = ts.formatDiagnosticsWithColorAndContext(errors, diagnostics_host)
  return {count: errors.length, text}
}

export function compileFiles(inputs: string[], options: ts.CompilerOptions): TSOutput {
  const program = ts.createProgram(inputs, options) //, host)

  const outputs: Outputs = new Map()
  const emitted = program.emit(undefined, (name, output) => outputs.set(name, output))
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitted.diagnostics)

  if (diagnostics.length == 0)
    return {outputs}
  else {
    const failure = reportDiagnostics(diagnostics)
    return {outputs, failure}
  }
}

export type OutDir = string | {js: string, dts: string}

export function compileProject(tsconfig_path: string, out_dir?: OutDir): TSOutput {
  const config_file = ts.readConfigFile(tsconfig_path, ts.sys.readFile)
  if (config_file.error != null) {
    return {failure: reportDiagnostics([config_file.error])}
  }

  const host: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readDirectory: ts.sys.readDirectory,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
  }

  let preconfigure: ts.CompilerOptions = {}
  if (out_dir != null) {
    if (typeof out_dir == "string")
      preconfigure = {outDir: out_dir}
    else
      preconfigure = {outDir: out_dir.js, declarationDir: out_dir.dts, declaration: true}
  }

  const tsconfig = ts.parseJsonConfigFileContent(config_file.config, host, dirname(tsconfig_path), preconfigure)
  if (tsconfig.errors.length != 0) {
    return {failure: reportDiagnostics(tsconfig.errors)}
  }

  return compileFiles(tsconfig.fileNames, tsconfig.options)
}

export interface CompileOptions {
  log: (message: string) => void
  out_dir?: OutDir
}

export function compileTypeScript(tsconfig: string, options: CompileOptions): boolean {
  const {outputs, failure} = compileProject(tsconfig, options.out_dir)

  if (outputs != null) {
    for (const [file, content] of outputs)
      ts.sys.writeFile(file, content)
  }

  if (failure != null)
    options.log(`There were ${chalk.red("" + failure.count)} TypeScript errors:\n${failure.text}`)

  return failure == null
}

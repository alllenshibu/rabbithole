import * as path from 'path';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as os from 'os';

export interface Dependency {
    name: string;
    path: string;
    dependencies?: Dependency[];
}

export class Analyzer {
    private file: string;
    private projectRoot: string;
    private depth: number;
    private allowedPathAliases: Map<string, string> = new Map();
    private program: ts.Program;
    private tempDir: string;
    private moduleCacheFile: string;

    constructor(file: string, projectRoot: string, allowedPathAliases: Record<string, string[]>, depth: number) {
        this.file = file;
        this.projectRoot = projectRoot;
        this.depth = depth;

        for (const [alias, paths] of Object.entries(allowedPathAliases)) {
            if (paths.length > 0) {
                this.allowedPathAliases.set(alias, paths[0]);
            }
        }

        const transpileOptions = {
            target: ts.ScriptTarget.ES5,
            module: ts.ModuleKind.CommonJS,
        };
        this.program = ts.createProgram([this.file], transpileOptions);

        this.tempDir = fs.mkdtempSync(path.join(process.cwd(), 'analyzer-'));
        this.moduleCacheFile = path.join(this.tempDir, 'moduleCache.json');

        if (!fs.existsSync(this.moduleCacheFile)) {
            fs.writeFileSync(this.moduleCacheFile, JSON.stringify({}));
        }
    }

    createDependencyAnalysis() {
        let deps: Dependency[] = [];
        let sourceFiles: readonly ts.SourceFile[] = this.program.getSourceFiles();

        const rootFileNamesWithModules = {
            name: path
                .basename(this.file)
                .replace(/\.[^/.]+$/, ''),
            path: path.resolve(this.file)
        };

        sourceFiles.forEach((file: ts.SourceFile) => {
            let filePath = path.resolve(file.fileName);

            // Skip non-root files
            if (!path.resolve(this.file).includes(filePath)) return

            deps.push(...this.getDependencies(file, this.depth));
        });

        this.cleanup();

        return {
            name: rootFileNamesWithModules.name,
            path: rootFileNamesWithModules.path,
            dependencies: deps
        };
    }

    private getDependencies(sourceFile: ts.SourceFile, level: number): Dependency[] {
        if(level === 0) return [];

        console.log("Processing file:", sourceFile.fileName);

        let deps: Dependency[] = [];

        ts.forEachChild(sourceFile, (node) => {
            if (ts.isImportDeclaration(node)) {

                let moduleNames: string[] = ['default'];
                const modulePath = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
                let resolvedPath = this.resolveModulePath(sourceFile.fileName, modulePath);

                if (!resolvedPath) return;

                if (node?.importClause?.namedBindings) {
                    if (ts.isNamedImports(node.importClause.namedBindings)) {
                        moduleNames = node.importClause.namedBindings.elements
                            .map(element => element.name.getText(sourceFile));
                    } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                        moduleNames = [`* as ${node.importClause.namedBindings.name.getText(sourceFile)}`];
                    }
                } else if (node?.importClause?.name) {
                    moduleNames = [node.importClause.name.getText(sourceFile)];
                }

                const cachedDep = this.getCachedDependency(resolvedPath);
                if (cachedDep) {
                    moduleNames.forEach(moduleName => {
                        deps.push({
                            name: moduleName,
                            path: cachedDep.path,
                            dependencies: cachedDep.dependencies,
                        });
                    });
                    return;
                }

                const childSourceFiles = this.getChildSourceFiles(resolvedPath);

                let childDeps: Dependency[] = [];
                childSourceFiles.forEach((childSourceFile) => {
                    if (childSourceFile.fileName.includes("node_modules")) return;

                    let d: Dependency[] = this.getDependencies(childSourceFile, level - 1);
                    childDeps.push(...d);
                });

                const dep: Dependency = {
                    name: '',
                    path: resolvedPath,
                    dependencies: childDeps.length > 0 ? childDeps : undefined,
                };

                this.cacheDependency(resolvedPath, dep);

                moduleNames.forEach((moduleName: string) => {
                    deps.push({
                        name: moduleName,
                        path: resolvedPath,
                        dependencies: childDeps.length > 0 ? childDeps : undefined,
                    });
                });
            }
        });

        return deps;
    }

    private resolveModulePath(sourceFilePath: string, modulePath: string): string | null {
        let resolvedPath: string = '';
        if (modulePath.startsWith('.')) {
            resolvedPath = path.resolve(path.dirname(sourceFilePath), modulePath);
        }

        const aliasMatch = [...this.allowedPathAliases.entries()].find(([alias]) =>
            modulePath.startsWith(alias));

        if (aliasMatch) {
            const [alias, replacement] = aliasMatch;
            resolvedPath = modulePath.replace(alias, replacement);
            resolvedPath = path.resolve(this.projectRoot, resolvedPath);
        }

        if (resolvedPath === '') return null;

        if (resolvedPath.includes('node_modules')) return null;

        resolvedPath = resolvedPath.endsWith('.ts') ? resolvedPath : `${resolvedPath}.ts`;

        return resolvedPath;
    }

    private getChildSourceFiles(resolvedPath: string): readonly ts.SourceFile[] {
        const childProgram = ts.createProgram([resolvedPath], {
            target: ts.ScriptTarget.ES5,
            module: ts.ModuleKind.CommonJS,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
        });
        return childProgram.getSourceFiles();
    }

    private cacheDependency(modulePath: string, dependency: Dependency) {
        const cache = JSON.parse(fs.readFileSync(this.moduleCacheFile, 'utf-8'));
        cache[modulePath] = dependency;
        fs.writeFileSync(this.moduleCacheFile, JSON.stringify(cache));
    }

    private getCachedDependency(modulePath: string): Dependency | null {
        const cache = JSON.parse(fs.readFileSync(this.moduleCacheFile, 'utf-8'));
        return cache[modulePath] || null;
    }

    cleanup() {
        if (fs.existsSync(this.tempDir)) {
            fs.rmSync(this.tempDir, { recursive: true, force: true });
        }
    }
}

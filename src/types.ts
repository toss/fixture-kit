/**
 * @description A file tree where string values are file contents and
 * object values are nested directories.
 */
export interface FixtureTree {
  [name: string]: string | FixtureTree;
}

export interface FixtureOptions {
  plugins?: readonly FixturePlugin[];
}

export interface FixtureContext {
  readonly root: string;
}

export interface FixturePlugin {
  setup?: (context: FixtureContext) => void | Promise<void>;
  teardown?: (context: FixtureContext) => void | Promise<void>;
}

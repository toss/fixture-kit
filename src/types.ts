/**
 * @description A file tree where string values are file contents and
 * object values are nested directories.
 */
export interface FixtureTree {
  [name: string]: string | FixtureTree;
}

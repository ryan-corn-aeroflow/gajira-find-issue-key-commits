import { logger } from '@broadshield/github-actions-core-typed-inputs';
import * as fs from 'node:fs';
import * as path from 'node:path';

const emptyArgumentPath = "Arg 'path' must not be empty";

export const FileTypeEnum = {
  File: 1,
  Directory: 2,
  SymbolicLink: 3,
  Unknown: 4,
  Missing: 5,
};
export function pathType(filepath) {
  if (!filepath) {
    throw new Error(emptyArgumentPath);
  }
  try {
    const stats = fs.statSync(filepath);
    if (stats.isFile()) {
      return FileTypeEnum.File;
    }
    if (stats.isDirectory()) {
      return FileTypeEnum.Directory;
    }
    if (stats.isSymbolicLink()) {
      return FileTypeEnum.SymbolicLink;
    }
    return FileTypeEnum.Unknown;
  } catch {
    return FileTypeEnum.Missing;
  }
}
export function topDirectory(providedPath) {
  if (!providedPath) {
    throw new Error(emptyArgumentPath);
  }
  const pt = pathType(providedPath);
  if (pt === FileTypeEnum.Missing) {
    throw new Error(emptyArgumentPath);
  }
  if (pt === FileTypeEnum.File) {
    return path.dirname(providedPath);
  }
  return providedPath;
}

export function directoryExistsSync(filepath, required) {
  if (!filepath) {
    throw new Error(emptyArgumentPath);
  }
  const pt = pathType(filepath);
  if (pt === FileTypeEnum.Missing) {
    if (required) {
      throw new Error(`Directory '${filepath}' does not exist`);
    }
    return false;
  }
  if (pt !== FileTypeEnum.Directory) {
    throw new Error(`Path '${filepath}' is not a directory`);
  }
  return true;
}

export function existsSync(filepath) {
  if (!filepath) {
    throw new Error(emptyArgumentPath);
  }

  try {
    fs.statSync(filepath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw new Error(`Encountered an error when checking whether path '${filepath}' exists: ${error.message}`);
  }

  return true;
}

export function fileExistsSync(filepath) {
  if (!filepath) {
    throw new Error(emptyArgumentPath);
  }

  try {
    const stats = fs.statSync(filepath);
    return !stats.isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw new Error(`Encountered an error when checking whether path '${filepath}' exists: ${error.message}`);
  }
}

export function loadFileSync(filepath) {
  if (!filepath) {
    throw new Error(emptyArgumentPath);
  }
  try {
    if (fileExistsSync(filepath)) {
      return fs.readFileSync(filepath, 'utf8');
    }
  } catch (error) {
    throw new Error(`Encountered an error when reading file '${filepath}': ${error.message}`);
  }
  throw new Error(`Encountered an error when reading file '${filepath}': file not there`);
}
export function mkdir(filepath, isFile = false) {
  if (!filepath) {
    throw new Error(emptyArgumentPath);
  }
  const directory = isFile ? path.dirname(filepath) : filepath;

  fs.mkdir(directory, { recursive: true }, (error) => {
    if (error) {
      logger.error(error);
    }
  });
}

export function writeFileSync(filepath, content) {
  if (!filepath) {
    throw new Error(emptyArgumentPath);
  }
  mkdir(filepath, true);

  return fs.writeFileSync(filepath, content, {
    encoding: 'utf8',
    flag: 'w',
  });
}

export function appendFileSync(filepath, content) {
  if (!filepath) {
    throw new Error(emptyArgumentPath);
  }

  mkdir(filepath, true);
  return fs.appendFileSync(filepath, content, {
    encoding: 'utf8',
  });
}

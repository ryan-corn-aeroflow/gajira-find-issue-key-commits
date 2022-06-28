import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const emptyArgPath = "Arg 'path' must not be empty";
export function directoryExistsSync(filepath, required) {
  if (!filepath) {
    throw new Error(emptyArgPath);
  }
  try {
    const stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      return true;
    }
    if (!required) {
      return false;
    }

    throw new Error(`Directory '${filepath}' does not exist`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      if (!required) {
        return false;
      }

      throw new Error(`Directory '${filepath}' does not exist`);
    }

    throw new Error(
      `Encountered an error when checking whether path '${filepath}' exists: ${error.message}`,
    );
  }
}

export function existsSync(filepath) {
  if (!filepath) {
    throw new Error(emptyArgPath);
  }

  try {
    fs.statSync(filepath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw new Error(
      `Encountered an error when checking whether path '${filepath}' exists: ${error.message}`,
    );
  }

  return true;
}

export function fileExistsSync(filepath){
  if (!filepath) {
    throw new Error(emptyArgPath);
  }

  try {
    const stats = fs.statSync(filepath);
    return !stats.isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw new Error(
      `Encountered an error when checking whether path '${filepath}' exists: ${error.message}`,
    );
  }
}

export function loadFileSync(filepath) {
  if (!filepath) {
    throw new Error(emptyArgPath);
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
export function mkdir(filepath) {
  if (!directoryExistsSync(filepath, true)) {
    fs.mkdir(path.dirname(filepath), { recursive: true }, (error) => {
      if (error) {
        core.error(error);
      }
    });
  }
}

export function writeFileSync(filepath, content) {
  if (!filepath) {
    throw new Error(emptyArgPath);
  }
  mkdir(filepath);

      return fs.writeFileSync(filepath, content, {
        encoding: 'utf8',
        flag: 'w'
      });


}

export function appendFileSync(filepath, content) {
  if (!filepath) {
    throw new Error(emptyArgPath);
  }

  mkdir(filepath);
      return fs.appendFileSync(filepath, content, {
        encoding: 'utf8',
      });


}

import { exec as exec_origin } from 'child_process';
import util from 'util';
import { basename, dirname, join } from 'path';
import { existsSync } from 'fs';
import { stat, copyFile, writeFile, rm, readdir, mkdir } from 'fs/promises';
import debug from 'debug';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = debug('sea');

const exec = util.promisify(exec_origin);

/**
 * Create single executable application (SEA) from entry script
 * See also https://nodejs.org/api/single-executable-applications.html
 * @param {string} script_entry_path 
 * @param {string} executable_path 
 */
export default async function sea(
  script_entry_path,
  executable_path,
  { disableExperimentalSEAWarning, useSnapshot, useCodeCache } = {
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false
  }) {
  // check if script_entry_path exists and is a file
  if (!(await stat(script_entry_path)).isFile()) {
    throw new Error(`Script entry path ${script_entry_path} does not exist`);
  }
  // check if executable_path exists
  if (existsSync(executable_path)) {
    console.warn(`Executable path ${executable_path} already exists, will be overwritten`);
  }
  // check node version, needs to be at least 20.0.0
  if (process.version < 'v20.0.0') {
    throw new Error(`Node version ${process.version} is too old, needs to be at least v20.0.0`);
  }
  // copy the executable as the output executable
  await copyFile(process.execPath, executable_path);
  // create a temporary directory for the processing work
  const temp_dir = join(__dirname, '../.temp');
  // create the temporary directory if it does not exist
  if (!existsSync(temp_dir)) {
    await mkdir(temp_dir);
  }
  // change working directory to temp_dir
  process.chdir(temp_dir);
  // Create a configuration file building a blob that can be injected into the single executable application
  const preparation_blob_path = join(temp_dir, 'sea-prep.blob');
  const sea_config_path = join(temp_dir, 'sea-config.json');
  const sea_config = {
    main: script_entry_path,
    output: preparation_blob_path,
    disableExperimentalSEAWarning,
    useSnapshot,
    useCodeCache,
  }
  log(`Writing configuration file into ${sea_config_path}`);
  await writeFile(sea_config_path, JSON.stringify(sea_config));
  // Generate the blob to be injected
  log(`Generating blob into ${preparation_blob_path}`);
  await exec(`node --experimental-sea-config sea-config.json `);
  // Inject the blob into the copied binary by running postject
  log(`Injecting blob into ${basename(executable_path)}`);
  await exec(`npx postject ${executable_path} NODE_SEA_BLOB ${preparation_blob_path} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`);
  // Remove the temporary directory
  log(`Removing all the files in temporary directory ${temp_dir}`);
  await rm(temp_dir, { recursive: true });
}
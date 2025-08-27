const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const fsp = fs.promises;

const baseDir = process.cwd(); // folder where the exe was started
const mysqlFolder = path.join(baseDir, 'mysql');
const xamppStart = path.join(baseDir, 'xampp_start.exe');
const xamppStop = path.join(baseDir, 'xampp_stop.exe');
const dumpFile = path.join(baseDir, 'backup.sql');

const mysqldumpBin = path.join(baseDir, 'mysql', 'bin', 'mysqldump.exe');
const mysqlBin = path.join(baseDir, 'mysql', 'bin', 'mysql.exe');

const mysqlPidFile = path.join(baseDir, 'mysql', 'data', 'mysql.pid');

const exclude = ['phpmyadmin', 'test'];
const ignoreFlags = exclude.map(db => `--ignore-database=${db}`).join(' ');

const readline = require('readline');

function waitForKeypress() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question('\nPress any key to exit...', () => {
      rl.close();
      resolve();
    });
  });
}

(async () => {
  try {
    if (!fs.existsSync(xamppStart)) throw console.log('Please run this file in your "xampp" folder!');

    if (fs.existsSync(mysqlPidFile)) spawnSync(xamppStop, { stdio: 'inherit' });

    // Step 1: Rename ./mysql to ./mysql_old
    const dataFolder = path.join(mysqlFolder, 'data');
    const dataTmpFolder = path.join(mysqlFolder, 'data_tmp');
    if (!fs.existsSync(mysqlFolder)) throw console.log('MySQL folder not found!');
    console.log('Renaming data to data_old...');
    await fsp.rename(dataFolder, dataTmpFolder);

    const mysqlBackup = path.join(mysqlFolder, 'backup');

    // Step 2: Copy ./mysql_copy to ./mysql
    console.log('Copying mysql/backup to mysql/data...');
    fs.cpSync(mysqlBackup, dataFolder, { recursive: true });

    // Step 3: Copy selected folders from ./mysql_old/data to ./mysql/data
    const excludedFolders = ['phpmyadmin', 'mysql', 'performance_schema', 'test'];
    const entries = await fsp.readdir(dataTmpFolder, { withFileTypes: true });

    console.log('Copying database folders from mysql/data_old to mysql/data...');
    for (const entry of entries) {
      const entryName = entry.name;
      const srcPath = path.join(dataTmpFolder, entryName);
      const destPath = path.join(dataFolder, entryName);

      if (entry.isDirectory() && !excludedFolders.includes(entryName)) {
        fs.cpSync(srcPath, destPath, { recursive: true });
        console.log(`Copied folder: ${entryName}`);
      }
    }

    // Step 4: Copy ibdata1 file
    const ibdataSrc = path.join(dataTmpFolder, 'ibdata1');
    const ibdataDest = path.join(dataFolder, 'ibdata1');

    if (fs.existsSync(ibdataSrc)) {
      console.log('Replacing ibdata1 file...');
      await fsp.copyFile(ibdataSrc, ibdataDest);
    }

    // Step 5: Start XAMPP
    console.log('Starting XAMPP...');
    spawnSync(xamppStart, { stdio: 'inherit' });

    // Step 6: Export all databases except excluded
    console.log('\nExporting databases...');
    // Dump all databases first
    execSync(`"${mysqldumpBin}" -u root --all-databases ${ignoreFlags} --result-file=${dumpFile}`);
    // Optionally filter excluded databases (post-processing required)

    // Step 7: Stop XAMPP
    console.log('Stopping XAMPP...');
    spawnSync(xamppStop, { stdio: 'inherit' });

    // Step 8: Delete ./mysql and ./mysql_old
    console.log('Deleting ./data_old...');
    await fsp.rm(dataTmpFolder, { recursive: true, force: true });

    // Step 9: Start XAMPP again and import dump
    console.log('Starting XAMPP again...');
    spawnSync(xamppStart, { stdio: 'inherit' });

    console.log('\nImporting backup.sql...');
    execSync(`${mysqlBin} -u root < ${dumpFile}`);

    // Step 9: Stop XAMPP again and import dump
    console.log('\Stopping XAMPP...');
    spawnSync(xamppStop, { stdio: 'inherit' });

    console.log('\nClean reset completed.');
  } catch (error) {
    if (error) console.error('Error occurred:', error);
  } finally {
    await waitForKeypress();
  }
})();

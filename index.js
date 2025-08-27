const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const fsp = fs.promises;

const sourceCopyFolder = './mysql_copy';
const oldMysqlFolder = './mysql_old';

const mysqlFolder = './mysql';
const xamppStart = './xampp_start.exe';
const xamppStop = './xampp_stop.exe';
const dumpFile = './backup.sql';

const mysqldumpBin = "C:\\xampp\\mysql\\bin\\mysqldump.exe";
const mysqlBin = "C:\\xampp\\mysql\\bin\\mysql.exe";

const exclude = ['phpmyadmin', 'test'];
const ignoreFlags = exclude.map(db => `--ignore-database=${db}`).join(' ');


(async () => {
  try {
    if (!fs.existsSync(xamppStart)) {
      console.error('Please run this file in your "xampp" folder!');
      process.exit(1);
    }
    spawnSync(xamppStop, { stdio: 'inherit' });

    // Step 1: Rename ./mysql to ./mysql_old
    if (fs.existsSync(mysqlFolder)) {
      console.log('Renaming mysql to mysql_old...');
      await fsp.rename(mysqlFolder, oldMysqlFolder);
    }

    // Step 2: Copy ./mysql_copy to ./mysql
    console.log('Copying mysql_copy to mysql...');
    fs.cpSync(sourceCopyFolder, mysqlFolder, { recursive: true });

    // Step 3: Copy selected folders from ./mysql_old/data to ./mysql/data
    const dataOldPath = path.join(oldMysqlFolder, 'data');
    const dataNewPath = path.join(mysqlFolder, 'data');

    const excludedFolders = ['phpmyadmin', 'mysql', 'performance_schema', 'test'];
    const entries = await fsp.readdir(dataOldPath, { withFileTypes: true });

    console.log('Copying database folders from mysql_old/data to mysql/data...');
    for (const entry of entries) {
      const entryName = entry.name;
      const srcPath = path.join(dataOldPath, entryName);
      const destPath = path.join(dataNewPath, entryName);

      if (entry.isDirectory() && !excludedFolders.includes(entryName)) {
        fs.cpSync(srcPath, destPath, { recursive: true });
        console.log(`Copied folder: ${entryName}`);
      }
    }

    // Step 4: Copy ibdata1 file
    const ibdataSrc = path.join(dataOldPath, 'ibdata1');
    const ibdataDest = path.join(dataNewPath, 'ibdata1');

    if (fs.existsSync(ibdataSrc)) {
      console.log('Replacing ibdata1 file...');
      await fsp.copyFile(ibdataSrc, ibdataDest);
    }

    // Step 5: Start XAMPP
    console.log('Starting XAMPP...');
    spawnSync(xamppStart, { stdio: 'inherit' });

    // Step 6: Export all databases except excluded
    console.log('Exporting databases...');
    const exclude = ['phpmyadmin', 'test'];
    // Dump all databases first
    execSync(`"${mysqldumpBin}" -u root --all-databases ${ignoreFlags} --result-file=${dumpFile}`);
    // Optionally filter excluded databases (post-processing required)

    // Step 7: Stop XAMPP
    console.log('Stopping XAMPP...');
    spawnSync(xamppStop, { stdio: 'inherit' });

    // Step 8: Delete ./mysql and ./mysql_old
    console.log('Deleting ./mysql and ./mysql_old...');
    await fsp.rm(mysqlFolder, { recursive: true, force: true });
    await fsp.rm(oldMysqlFolder, { recursive: true, force: true });

    // Step 9: Copy ./mysql_copy to ./mysql (fresh clean reset)
    console.log('Copying ./mysql_copy to ./mysql...');
    fs.cpSync(sourceCopyFolder, mysqlFolder, { recursive: true });

    // Step 10: Start XAMPP again and import dump
    console.log('Starting XAMPP again...');
    spawnSync(xamppStart, { stdio: 'inherit' });

    console.log('Importing backup.sql...');
    execSync(`${mysqlBin} -u root < ${dumpFile}`);

    console.log('Clean reset completed.');
  } catch (error) {
    console.error('Error occurred:', error);
  }
})();

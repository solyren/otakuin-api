import fs from 'fs';
import path from 'path';

const logDirectory = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

const logFile = path.join(logDirectory, 'app.log');

export const logger = (message: string) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, `${logMessage}\n`);
};

export const errorLogger = (error: Error) => {
    const timestamp = new Date().toISOString();
    const errorMessage = `[${timestamp}] ${error.stack || error.message}`;
    console.error(errorMessage);
    fs.appendFileSync(logFile, `${errorMessage}\n`);
}


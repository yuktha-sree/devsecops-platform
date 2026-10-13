// Development helper: makes sure the PostgreSQL database and tables exist.
//  1. Tests the connection and prints a clear message if the login fails.
//  2. Creates the database (DB_NAME) when it is missing (local PostgreSQL only).
//  3. Applies schema.sql (safe to run repeatedly).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const db = require('../config/db');
const { describeDbError, dbErrorCode } = require('../utils/dbErrors');

async function createDatabaseIfMissing() {
  const name = process.env.DB_NAME || 'devsecops';
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('DB_NAME may only contain letters, digits and underscores');
  const admin = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    console.log(`Created database "${name}".`);
  } finally {
    await admin.end();
  }
}

async function ensureDatabase() {
  try {
    try {
      await db.query('SELECT 1');
    } catch (err) {
      if (dbErrorCode(err) === '3D000' && !process.env.DATABASE_URL) {
        await createDatabaseIfMissing();
        await db.query('SELECT 1');
      } else {
        throw err;
      }
    }
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await db.pool.query(sql);
    console.log('Database ready (tables are up to date).');
    return true;
  } catch (err) {
    console.error(`DATABASE PROBLEM: ${describeDbError(err) || err.message}`);
    return false;
  }
}

module.exports = { ensureDatabase };

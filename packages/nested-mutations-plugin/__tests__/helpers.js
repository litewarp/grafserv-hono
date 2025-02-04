const { readFile } = require('node:fs');
const pg = require('pg');
const pgConnectionString = require('pg-connection-string');
const { createPostGraphileSchema } = require('postgraphile-core');

function readFilePromise(filename, encoding) {
  return new Promise((resolve, reject) => {
    readFile(filename, encoding, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

const kitchenSinkData = () => readFilePromise(`${__dirname}/data.sql`, 'utf8');

const withPgClient = async (url, fn) => {
  if (!fn) {
    fn = url;
    url = process.env.TEST_DATABASE_URL;
  }
  const pgPool = new pg.Pool(pgConnectionString.parse(url));
  let client;
  try {
    client = await pgPool.connect();
    await client.query('begin');
    await client.query("set local timezone to '+04:00'");
    const result = await fn(client);
    await client.query('rollback');
    return result;
  } finally {
    try {
      await client.release();
    } catch (e) {
      console.error('Error releasing pgClient', e);
      throw e;
    }
    await pgPool.end();
  }
};

const withDbFromUrl = async (url, fn) =>
  withPgClient(url, async (client) => {
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE;');
      return fn(client);
    } finally {
      await client.query('COMMIT;');
    }
  });

const withRootDb = (fn) => withDbFromUrl(process.env.TEST_DATABASE_URL, fn);

let prepopulatedDBKeepalive;

const populateDatabase = async (client) => {
  await client.query(await readFilePromise(`${__dirname}/data.sql`, 'utf8'));
  return {};
};

const withPrepopulatedDb = async (fn) => {
  if (!prepopulatedDBKeepalive) {
    throw new Error('You must call setup and teardown to use this');
  }
  const { client, vars } = prepopulatedDBKeepalive;
  if (!vars) {
    throw new Error('No prepopulated vars');
  }
  let err;
  try {
    await fn(client, vars);
  } catch (e) {
    err = e;
  }
  try {
    await client.query('ROLLBACK TO SAVEPOINT pristine;');
  } catch (e) {
    err = err || e;
    console.error('ERROR ROLLING BACK', e.message); // eslint-disable-line no-console
  }
  if (err) {
    throw err;
  }
};

withPrepopulatedDb.setup = async () => {
  if (prepopulatedDBKeepalive) {
    throw new Error("There's already a prepopulated DB running");
  }
  let res;
  let rej;
  prepopulatedDBKeepalive = new Promise((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
  prepopulatedDBKeepalive.resolve = res;
  prepopulatedDBKeepalive.reject = rej;
  withRootDb(async (client) => {
    prepopulatedDBKeepalive.client = client;
    try {
      prepopulatedDBKeepalive.vars = await populateDatabase(client);
    } catch (e) {
      console.error('FAILED TO PREPOPULATE DB!', e.message);
      throw e;
    }
    await client.query('SAVEPOINT pristine;');
    return prepopulatedDBKeepalive;
  });
};

withPrepopulatedDb.teardown = () => {
  if (!prepopulatedDBKeepalive) {
    throw new Error('Cannot tear down null!');
  }
  prepopulatedDBKeepalive.resolve(); // Release DB transaction
  prepopulatedDBKeepalive = null;
};

const withSchema =
  ({ setup, test, options = {} }) =>
  () =>
    withPgClient(async (client) => {
      if (setup) {
        if (typeof setup === 'function') {
          await setup(client);
        } else {
          await client.query(setup);
        }
      }

      const schemaOptions = {
        appendPlugins: [require('../index.js')],
        showErrorStack: true,
        ...options,
      };

      const schema = await createPostGraphileSchema(
        client,
        ['p'],
        schemaOptions,
      );
      return test({
        schema,
        pgClient: client,
      });
    });

const loadQuery = (fn) =>
  readFilePromise(`${__dirname}/fixtures/queries/${fn}`, 'utf8');

exports.withRootDb = withRootDb;
exports.withPrepopulatedDb = withPrepopulatedDb;
exports.withPgClient = withPgClient;
exports.withSchema = withSchema;
exports.loadQuery = loadQuery;

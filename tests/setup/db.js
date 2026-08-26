/**
 * Shared in-memory MongoDB setup for integration tests.
 * Uses mongodb-memory-server so tests never depend on an external database.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

async function connectTestDatabase() {
  mongoServer = await MongoMemoryServer.create({
    instance: { launchTimeout: 30000 },
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  return uri;
}

async function disconnectTestDatabase() {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
}

async function clearCollections() {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

module.exports = { connectTestDatabase, disconnectTestDatabase, clearCollections };

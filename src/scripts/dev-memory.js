/**
 * Démarre l'application avec une base MongoDB en mémoire.
 *
 *   node src/scripts/dev-memory.js
 *
 * Pratique pour tester sans installer MongoDB : les données sont
 * éphémères (réinitialisées à chaque démarrage) et le jeu de démo
 * est chargé automatiquement.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const { spawn, spawnSync } = require('child_process');
const path = require('path');

(async () => {
  console.log('[dev-memory] Démarrage de MongoDB en mémoire...');
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri('ecommerce');
  console.log(`[dev-memory] MongoDB prêt : ${uri}`);

  console.log('[dev-memory] Chargement du jeu de données de démonstration...');
  const seed = spawnSync(process.execPath, [path.join(__dirname, 'seed.js')], {
    env: { ...process.env, MONGODB_URI: uri },
    stdio: 'inherit',
  });
  if (seed.status !== 0) {
    console.error('[dev-memory] Seed échoué, arrêt.');
    process.exit(1);
  }

  console.log('[dev-memory] Lancement du serveur HTTP...');
  const server = spawn(process.execPath, [path.join(__dirname, '../server.js')], {
    env: { ...process.env, MONGODB_URI: uri },
    stdio: 'inherit',
  });

  const shutdown = () => {
    console.log('\n[dev-memory] Arrêt...');
    server.kill();
    mongod.stop().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.on('exit', async (code) => {
    console.log(`[dev-memory] Serveur terminé (code ${code})`);
    await mongod.stop();
    process.exit(code || 0);
  });
})().catch((error) => {
  console.error('[dev-memory] Erreur fatale:', error);
  process.exit(1);
});

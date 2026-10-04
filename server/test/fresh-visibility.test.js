/* Regression guard for the reconstructed product's explicit historical
 * visibility boundary. Archived rows remain in storage for evidence, while
 * normal social reads exclude them and newly-created rows remain visible.
 */
const fs = require('fs');
const path = require('path');
const { getDb, queryAll, queryOne, execute } = require('../db');

function assert(condition, message) {
  if (!condition) throw new Error(`[ASSERTION FAILED] ${message}`);
}

async function run() {
  await getDb();
  const activeId = 'duel_visibility_test_active';
  const archivedId = 'duel_visibility_test_archived';
  const activeActivity = 'activity_visibility_test_active';
  const archivedActivity = 'activity_visibility_test_archived';

  try {
    execute(`DELETE FROM activity WHERE id IN (?, ?)`, [activeActivity, archivedActivity]);
    execute(`DELETE FROM duels WHERE id IN (?, ?)`, [activeId, archivedId]);
    execute(
      `INSERT INTO duels (id, onchain_duel_id, captain_a_wallet, captain_b_wallet, proposition_a, proposition_b, status, created_at, is_archived)
       VALUES (?, ?, ?, ?, ?, ?, 'ACCEPTING_STAKES', ?, ?), (?, ?, ?, ?, ?, ?, 'ACCEPTING_STAKES', ?, ?)`,
      [
        activeId, '11111111111111111111111111111111', 'visibility-a', 'visibility-b', 'Visible', 'Visible counter', new Date().toISOString(), 0,
        archivedId, '22222222222222222222222222222222', 'visibility-a', 'visibility-b', 'Historical', 'Historical counter', new Date().toISOString(), 1,
      ]
    );
    execute(
      `INSERT INTO activity (id, user_wallet, type, title, message, is_read, is_archived, created_at)
       VALUES (?, ?, 'DUEL_STARTED', 'Visible Duel', 'Visible', 0, 0, ?), (?, ?, 'DUEL_STARTED', 'Archived Duel', 'Archived', 0, 1, ?)`,
      [activeActivity, 'visibility-a', new Date().toISOString(), archivedActivity, 'visibility-a', new Date().toISOString()]
    );

    const normalDuels = queryAll(
      `SELECT * FROM duels WHERE COALESCE(is_archived, 0) = 0 AND (captain_a_wallet = ? OR captain_b_wallet = ?)`,
      ['visibility-a', 'visibility-a']
    );
    assert(normalDuels.some((row) => row.id === activeId), 'non-archived Duel remains on normal reads');
    assert(!normalDuels.some((row) => row.id === archivedId), 'archived Duel is absent from normal reads');
    assert(queryOne(`SELECT * FROM duels WHERE id = ?`, [archivedId]), 'archived Duel remains directly retrievable for evidence');

    const normalActivity = queryAll(
      `SELECT * FROM activity WHERE user_wallet = ? AND COALESCE(is_archived, 0) = 0`,
      ['visibility-a']
    );
    assert(normalActivity.some((row) => row.id === activeActivity), 'new Activity remains visible');
    assert(!normalActivity.some((row) => row.id === archivedActivity), 'archived Activity is absent from normal reads');

    const duelsRoute = fs.readFileSync(path.join(__dirname, '..', 'routes', 'duels.js'), 'utf8');
    const usersRoute = fs.readFileSync(path.join(__dirname, '..', 'routes', 'users.js'), 'utf8');
    const activityRoute = fs.readFileSync(path.join(__dirname, '..', 'routes', 'activity.js'), 'utf8');
    assert(duelsRoute.includes('WHERE COALESCE(d.is_archived, 0) = 0'), 'Duels route applies the archive boundary');
    assert(usersRoute.includes('COALESCE(is_archived, 0) = 0'), 'Profile stats apply the archive boundary');
    assert(activityRoute.includes('COALESCE(is_archived, 0) = 0'), 'Activity route applies the archive boundary');

    console.log('Fresh visibility: PASS (normal surfaces hide archived rows; direct evidence remains retrievable)');
  } finally {
    execute(`DELETE FROM activity WHERE id IN (?, ?)`, [activeActivity, archivedActivity]);
    execute(`DELETE FROM duels WHERE id IN (?, ?)`, [activeId, archivedId]);
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

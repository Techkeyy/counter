const axios = require('axios');

async function resolveSports(config) {
  // config: { eventId: '441613', homeTeam: 'Liverpool', awayTeam: 'Tottenham', targetSide: 'home' }
  const eventId = config.eventId || '441613';
  const targetSide = config.targetSide || 'home';

  try {
    const res = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=${eventId}`, {
      timeout: 8000,
    });
    const event = res.data?.events?.[0];
    if (!event) {
      throw new Error(`Event not found for ID: ${eventId}`);
    }

    const homeScore = parseInt(event.intHomeScore, 10);
    const awayScore = parseInt(event.intAwayScore, 10);
    const homeTeam = event.strHomeTeam;
    const awayTeam = event.strAwayTeam;

    if (isNaN(homeScore) || isNaN(awayScore)) {
      return {
        success: false,
        pending: true,
        summary: `Match ${homeTeam} vs ${awayTeam} is not yet completed or scores pending.`,
      };
    }

    let winningSide = 0;
    if (homeScore > awayScore) {
      winningSide = targetSide === 'home' ? 1 : 2;
    } else if (awayScore > homeScore) {
      winningSide = targetSide === 'away' ? 1 : 2;
    } else {
      // Draw -> Cancel/Refund (3)
      winningSide = 3;
    }

    return {
      success: true,
      winningSide,
      evidence: {
        source: 'TheSportsDB API',
        eventId,
        event: `${homeTeam} vs ${awayTeam}`,
        homeScore,
        awayScore,
        status: event.strStatus || 'Match Finished',
        resolvedAt: new Date().toISOString(),
      },
      summary: `${homeTeam} (${homeScore}) vs ${awayTeam} (${awayScore}). Result: ${winningSide === 3 ? 'Draw / Refunded' : `Side ${winningSide === 1 ? 'A' : 'B'} Wins`}.`,
    };
  } catch (err) {
    return {
      success: false,
      error: `Sports resolution failed: ${err.message}`,
    };
  }
}

module.exports = { resolveSports };

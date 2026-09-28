const fs = require('fs');

// Pure Deterministic Resolver Engine
function resolveDuelProposition(terms, observation) {
  if (!terms || !observation) {
    return { outcome: 'VOID', reason: 'Missing terms or observation data' };
  }

  switch (terms.category) {
    case 'crypto': {
      // Condition: price [operator] target_price
      const observedPrice = parseFloat(observation.price);
      if (isNaN(observedPrice)) return { outcome: 'VOID', reason: 'Invalid observed price' };

      let conditionMet = false;
      if (terms.operator === '>=') conditionMet = observedPrice >= terms.target_price;
      else if (terms.operator === '<=') conditionMet = observedPrice <= terms.target_price;
      else if (terms.operator === '>') conditionMet = observedPrice > terms.target_price;
      else if (terms.operator === '<') conditionMet = observedPrice < terms.target_price;

      const winningSide = conditionMet ? 'SIDE_A' : 'SIDE_B';
      return {
        outcome: winningSide,
        winnerName: conditionMet ? terms.side_a_label : terms.side_b_label,
        observedValue: observedPrice,
        threshold: terms.target_price,
        operator: terms.operator,
        evidenceHash: observation.signature || observation.timestamp,
        reason: `Observed price $${observedPrice} ${conditionMet ? 'satisfies' : 'does not satisfy'} condition ${terms.operator} $${terms.target_price}`,
      };
    }

    case 'sports': {
      // Condition: side_a_score vs side_b_score
      const homeScore = parseInt(observation.homeScore, 10);
      const awayScore = parseInt(observation.awayScore, 10);
      if (isNaN(homeScore) || isNaN(awayScore)) return { outcome: 'VOID', reason: 'Incomplete match scores' };

      if (homeScore > awayScore) {
        return {
          outcome: 'SIDE_A',
          winnerName: terms.side_a_label,
          score: `${homeScore}-${awayScore}`,
          evidenceSource: terms.source,
          reason: `${terms.side_a_label} won with ${homeScore} vs ${awayScore}`,
        };
      } else if (awayScore > homeScore) {
        return {
          outcome: 'SIDE_B',
          winnerName: terms.side_b_label,
          score: `${homeScore}-${awayScore}`,
          evidenceSource: terms.source,
          reason: `${terms.side_b_label} won with ${awayScore} vs ${homeScore}`,
        };
      } else {
        return {
          outcome: terms.allow_draw ? 'DRAW_SPLIT' : 'VOID',
          score: `${homeScore}-${awayScore}`,
          reason: `Match ended in a draw (${homeScore}-${awayScore})`,
        };
      }
    }

    case 'weather': {
      // Condition: precipitation > threshold
      const observedPrecip = parseFloat(observation.precipitation_mm);
      if (isNaN(observedPrecip)) return { outcome: 'VOID', reason: 'Missing precipitation record' };

      const isRain = observedPrecip > terms.threshold_mm;
      const winningSide = isRain ? 'SIDE_A' : 'SIDE_B';
      return {
        outcome: winningSide,
        winnerName: isRain ? terms.side_a_label : terms.side_b_label,
        observedPrecipitation: `${observedPrecip}mm`,
        threshold: `${terms.threshold_mm}mm`,
        reason: `Observed ${observedPrecip}mm precipitation -> Outcome: ${isRain ? 'RAIN' : 'DRY'}`,
      };
    }

    default:
      return { outcome: 'VOID', reason: `Unsupported category: ${terms.category}` };
  }
}

function runDeterministicResolutionTests() {
  console.log('===========================================================');
  console.log('--- DETERMINISTIC RESOLUTION ENGINE & EVIDENCE PROOFS ---');
  console.log('===========================================================');

  // Case 1: Crypto Proposition
  const cryptoTerms = {
    category: 'crypto',
    asset: 'SOL/USD',
    side_a_label: 'Praise (SOL >= $125)',
    side_b_label: 'Daniel (SOL < $125)',
    operator: '>=',
    target_price: 125.0,
    source: 'CoinGecko Spot Price API',
    cutoff_ts: 1774771200,
    resolution_ts: 1774774800,
  };
  const cryptoObservation = {
    price: 118.74,
    timestamp: '2026-09-28T08:00:00Z',
    signature: 'cg_obs_88f91a',
  };
  const cryptoResult = resolveDuelProposition(cryptoTerms, cryptoObservation);
  console.log('\n[1] CRYPTO RESOLUTION PROOF:');
  console.log('Terms:', cryptoTerms);
  console.log('Observation:', cryptoObservation);
  console.log('Result:', cryptoResult);

  // Case 2: Sports Proposition
  const sportsTerms = {
    category: 'sports',
    fixture: 'Liverpool vs Tottenham',
    side_a_label: 'Liverpool (Praise)',
    side_b_label: 'Tottenham (Daniel)',
    source: 'TheSportsDB Official API',
    allow_draw: false,
  };
  const sportsObservation = {
    homeTeam: 'Liverpool',
    awayTeam: 'Tottenham',
    homeScore: 3,
    awayScore: 1,
    status: 'FT',
    matchDate: '2026-09-15',
  };
  const sportsResult = resolveDuelProposition(sportsTerms, sportsObservation);
  console.log('\n[2] SPORTS RESOLUTION PROOF:');
  console.log('Terms:', sportsTerms);
  console.log('Observation:', sportsObservation);
  console.log('Result:', sportsResult);

  // Case 3: Weather Proposition
  const weatherTerms = {
    category: 'weather',
    location: 'London, UK (51.5074, -0.1278)',
    side_a_label: 'Rain (Praise: Precip > 0mm)',
    side_b_label: 'Dry (Daniel: Precip == 0mm)',
    threshold_mm: 0.0,
    source: 'Open-Meteo Meteorological API',
  };
  const weatherObservation = {
    precipitation_mm: 0.0,
    temperature_c: 14.1,
    observationTime: '2026-09-28T08:00:00Z',
  };
  const weatherResult = resolveDuelProposition(weatherTerms, weatherObservation);
  console.log('\n[3] WEATHER RESOLUTION PROOF:');
  console.log('Terms:', weatherTerms);
  console.log('Observation:', weatherObservation);
  console.log('Result:', weatherResult);

  // Save evidence output
  const evidenceReport = {
    timestamp: new Date().toISOString(),
    cases: [
      { terms: cryptoTerms, observation: cryptoObservation, result: cryptoResult },
      { terms: sportsTerms, observation: sportsObservation, result: sportsResult },
      { terms: weatherTerms, observation: weatherObservation, result: weatherResult },
    ],
  };
  fs.writeFileSync('probes/deterministic-evidence.json', JSON.stringify(evidenceReport, null, 2));
  console.log('\n[PASS] Evidence artifacts saved to probes/deterministic-evidence.json');
}

runDeterministicResolutionTests();

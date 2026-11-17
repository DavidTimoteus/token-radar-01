import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RadarModel = require('../dashboard/model.js');

export const {
  cleanTradedComps,
  fitSizeCurveComps,
  evaluateLooBacktest,
  scorePreTokenProtocol,
  computeNetFarmVerdict,
  sortChainsByLiquidity,
  buildRadarPayload,
} = RadarModel;

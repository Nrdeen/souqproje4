import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calculateHerdFeedEstimate,
  calculateTransportEstimate,
} from '../../src/lib/marketplace-tools';
import { createRoute, parseUrlToRoute, routeToUrl, type PageView } from '../../src/lib/router';

test('calculateTransportEstimate computes distance, vehicle scaling, and care add-ons accurately', () => {
  const base = calculateTransportEstimate({
    distanceKm: 360,
    headCount: 15,
    vehicleType: 'medium_truck',
    includeVetCare: false,
    includeFeedWaterStop: false,
  });

  assert.equal(base.recommendedVehicle, 'medium_truck');
  assert.equal(base.baseDispatchSar, 260);
  assert.equal(base.distanceChargeSar, Math.round(360 * 3.4));
  assert.equal(base.careAddonsSar, 0);
  assert.equal(base.totalEstimatedSar, base.baseDispatchSar + base.distanceChargeSar);
  assert.equal(base.perHeadSar, Math.round(base.totalEstimatedSar / 15));

  const largeWithCare = calculateTransportEstimate({
    distanceKm: 640,
    headCount: 80,
    vehicleType: 'medium_truck',
    includeVetCare: true,
    includeFeedWaterStop: true,
  });

  // 80 heads exceeds 45-head medium truck capacity => recommends heavy_carrier and 2 trips on medium_truck
  assert.equal(largeWithCare.recommendedVehicle, 'heavy_carrier');
  assert.equal(largeWithCare.careAddonsSar, Math.round(120 + 80 * 8 + (90 + 80 * 4)));
  assert.equal(
    largeWithCare.totalEstimatedSar,
    largeWithCare.baseDispatchSar +
      largeWithCare.distanceChargeSar +
      largeWithCare.careAddonsSar
  );
  assert.ok(largeWithCare.perHeadSar > 0);
});

test('calculateHerdFeedEstimate computes barley sacks, alfalfa bales, and SAR budget accurately', () => {
  const fatteningSheep = calculateHerdFeedEstimate({
    species: 'sheep',
    goal: 'fattening',
    headCount: 50,
    days: 30,
    barleySackPriceSar: 68,
    alfalfaBalePriceSar: 28,
  });

  assert.equal(fatteningSheep.headCount, 50);
  assert.equal(fatteningSheep.days, 30);
  assert.ok(fatteningSheep.totalGrainKg > 0);
  assert.ok(fatteningSheep.totalForageKg > 0);
  assert.equal(fatteningSheep.barleySacksNeeded, Math.ceil(fatteningSheep.totalGrainKg / 50));
  assert.equal(fatteningSheep.alfalfaBalesNeeded, Math.ceil(fatteningSheep.totalForageKg / 20));
  assert.ok(fatteningSheep.mineralsAndWaterCostSar > 0);
  assert.equal(
    fatteningSheep.costPerHeadTotalSar,
    Math.round(fatteningSheep.totalCostSar / 50)
  );
  assert.equal(
    fatteningSheep.costPerHeadPerMonthSar,
    Math.round((fatteningSheep.totalCostSar / 50 / 30) * 30)
  );

  const maintenanceGoat = calculateHerdFeedEstimate({
    species: 'goat',
    goal: 'maintenance',
    headCount: 50,
    days: 30,
    barleySackPriceSar: 68,
    alfalfaBalePriceSar: 28,
  });
  assert.ok(maintenanceGoat.totalCostSar < fatteningSheep.totalCostSar);
});

test('Router round-trips all new calculator, knowledge, and policy pages bidirectionally', () => {
  const expectedUrls: Array<[PageView, string]> = [
    ['transport', '/transport-calculator'],
    ['feed', '/feed-calculator'],
    ['guides', '/guides'],
    ['help', '/help'],
    ['about', '/about'],
    ['rules', '/rules'],
    ['privacy', '/privacy'],
    ['terms', '/terms'],
  ];

  for (const [page, expectedUrl] of expectedUrls) {
    const url = routeToUrl(createRoute({ page }));
    assert.equal(url, expectedUrl);
    const parsed = parseUrlToRoute(url, '');
    assert.equal(parsed.page, page);
  }
  assert.equal(parseUrlToRoute('/transport', '').page, 'transport');
  assert.equal(parseUrlToRoute('/feed', '').page, 'feed');
});

test('Unified DynamicHeroBanner supports compact and showcase modes across secondary pages', () => {
  const bannerSrc = readFileSync(
    resolve(process.cwd(), 'src/components/DynamicHeroBanner.tsx'),
    'utf8'
  );
  assert.match(bannerSrc, /export type DynamicHeroStyle = 'auto' \| 'showcase' \| 'compact'/);
  assert.match(bannerSrc, /heroStyle\?:\s*DynamicHeroStyle/);
  assert.match(bannerSrc, /defaultStyle:\s*'compact'/);
  assert.match(bannerSrc, /defaultStyle:\s*'showcase'/);
  for (const key of ['transport', 'feed', 'guides', 'help', 'about', 'rules', 'privacy', 'terms']) {
    assert.match(bannerSrc, new RegExp(`'${key}'`));
  }
});

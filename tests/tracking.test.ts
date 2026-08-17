import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  describeTracking,
  inferTrackingCarrier,
  normalizeTrackingCarrier,
  orderStatusBadge,
  orderStatusLabel,
  trackingUrl
} from '../lib/tracking.ts';

describe('normalizeTrackingCarrier', () => {
  it('recognises the carriers Tammy is likely to type', () => {
    assert.equal(normalizeTrackingCarrier('usps'), 'USPS');
    assert.equal(normalizeTrackingCarrier('US Postal Service'), 'USPS');
    assert.equal(normalizeTrackingCarrier('UPS Ground'), 'UPS');
    assert.equal(normalizeTrackingCarrier('FedEx Express'), 'FedEx');
    assert.equal(normalizeTrackingCarrier('federal express'), 'FedEx');
    assert.equal(normalizeTrackingCarrier('DHL Express'), 'DHL');
    assert.equal(normalizeTrackingCarrier('OnTrac'), 'OnTrac');
    assert.equal(normalizeTrackingCarrier('something else'), null);
  });
});

describe('inferTrackingCarrier', () => {
  it('reads UPS, USPS and FedEx numbers', () => {
    assert.equal(inferTrackingCarrier('1Z999AA10123456784'), 'UPS');
    assert.equal(inferTrackingCarrier('9400111899223034123456'), 'USPS');
    assert.equal(inferTrackingCarrier('EA123456789US'), 'USPS');
    assert.equal(inferTrackingCarrier('794644304390'), 'FedEx');
    assert.equal(inferTrackingCarrier('TBA123456789012'), 'Amazon');
    assert.equal(inferTrackingCarrier('not-a-number'), null);
  });
});

describe('trackingUrl', () => {
  it('prefers the typed carrier and still guesses from the number', () => {
    assert.equal(
      trackingUrl('1Z999AA10123456784'),
      'https://www.ups.com/track?tracknum=1Z999AA10123456784'
    );
    assert.equal(
      trackingUrl('9400111899223034123456', 'USPS'),
      'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223034123456'
    );
    assert.equal(trackingUrl('mystery-123', 'Local courier'), null);
    assert.equal(trackingUrl('794644304390', 'Local courier'), null);
  });

  it('lets an explicit carrier override a guessed one', () => {
    assert.match(trackingUrl('794644304390', 'USPS') || '', /usps/i);
  });
});

describe('describeTracking', () => {
  it('builds a label a customer can click', () => {
    const info = describeTracking('1z999aa10123456784', 'ups ground');
    assert.equal(info.carrier, 'UPS');
    assert.equal(info.number, '1Z999AA10123456784');
    assert.equal(info.label, 'UPS 1Z999AA10123456784');
    assert.ok(info.url?.includes('ups.com'));
  });

  it('keeps an unknown typed courier instead of guessing FedEx', () => {
    const info = describeTracking('794644304390', 'Local courier');
    assert.equal(info.carrier, 'Local courier');
    assert.equal(info.url, null);
    assert.equal(info.label, 'Local courier 794644304390');
  });

  it('links a blank-carrier Amazon TBA number', () => {
    const info = describeTracking('tba123456789012');
    assert.equal(info.carrier, 'Amazon');
    assert.ok(info.url?.includes('track.amazon.com'));
  });
});

describe('orderStatusBadge', () => {
  it('never prints the raw enum', () => {
    assert.equal(orderStatusBadge('PARTIALLY_REFUNDED'), 'Partially refunded');
    assert.equal(orderStatusBadge('FULFILLED'), 'Shipped');
    assert.equal(orderStatusBadge('FULFILLED', 'PICKUP'), 'Ready for pickup');
    assert.equal(orderStatusBadge('PAID', 'PICKUP'), 'Preparing pickup');
    assert.doesNotMatch(orderStatusBadge('PARTIALLY_REFUNDED'), /_/);
  });
});

describe('orderStatusLabel', () => {
  it('never dumps a raw enum at the customer', () => {
    assert.equal(orderStatusLabel('FULFILLED'), 'Your order has shipped.');
    assert.equal(orderStatusLabel('FULFILLED', 'PICKUP'), 'Your order is ready for pickup.');
    assert.equal(orderStatusLabel('PAID'), 'We are preparing your order.');
    assert.equal(orderStatusLabel('PAID', 'PICKUP'), 'We are preparing your pickup.');
    assert.equal(orderStatusLabel('PARTIALLY_REFUNDED'), 'Part of this order was refunded.');
    assert.equal(orderStatusLabel('REFUNDED'), 'This order was refunded.');
    assert.equal(orderStatusLabel('CANCELLED'), 'This order was cancelled.');
    assert.doesNotMatch(orderStatusLabel('PARTIALLY_REFUNDED'), /partially_refunded/i);
  });
});

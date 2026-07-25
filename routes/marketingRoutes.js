// Coupons, banners, settings, notifications, delivery slots, contact messages.
// Mounted at /v1/admin (paths below match src/api/index.js in the admin UI).
const express = require('express');
const validate = require('../middleware/validate');
const c = require('../controllers/marketingController');
const v = require('../validators/marketingValidators');

const router = express.Router();

// Coupons
router.get('/coupons', validate(v.listQuery, 'query'), c.listCoupons);
router.post('/coupons', validate(v.couponCreate), c.createCoupon);
router.get('/coupons/:id', validate(v.idParam, 'params'), c.getCoupon);
router.get('/coupons/:id/stats', validate(v.idParam, 'params'), c.getCouponStats);
router.put('/coupons/:id', validate(v.idParam, 'params'), validate(v.couponUpdate), c.updateCoupon);
router.delete('/coupons/:id', validate(v.idParam, 'params'), c.deleteCoupon);

// Banners
router.get('/banners', validate(v.listQuery, 'query'), c.listBanners);
router.post('/banners', validate(v.bannerCreate), c.createBanner);
router.put('/banners/:id', validate(v.idParam, 'params'), validate(v.bannerUpdate), c.updateBanner);
router.delete('/banners/:id', validate(v.idParam, 'params'), c.deleteBanner);

// Settings + notifications
router.get('/settings', c.getSettings);
router.put('/settings', validate(v.settingsUpdate), c.updateSettings);
router.post('/notifications', c.sendNotification);

// Delivery slots
router.get('/delivery-slots', c.listSlots);
router.put('/delivery-slots/:id', validate(v.idParam, 'params'), validate(v.slotUpdate), c.updateSlot);

// Contact messages
router.get('/contact-messages', validate(v.messageListQuery, 'query'), c.listMessages);
router.patch('/contact-messages/:id', validate(v.idParam, 'params'), validate(v.messageRespond), c.respondMessage);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
  getAllCountryProfiles,
  getCountryProfileByName,
} = require('../controllers/countryProfiles.controller');

// Public read routes
router.get('/', getAllCountryProfiles);
router.get('/:country_name', getCountryProfileByName);

module.exports = router;

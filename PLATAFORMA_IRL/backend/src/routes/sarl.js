const express = require('express');
const router = express.Router();
const {uploadCsv} = require('../middlewares/upload.middleware');
const PucController = require('../controllers/sarl/puc.controller');

router.post('/puc/upload', uploadCsv, PucController.uploadFile);
router.delete('/puc/:periodDate', PucController.deletePeriod);

module.exports = router;
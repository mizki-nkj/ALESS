// ============================================================================
// PHASE 2 SAFE CODE
// Summer Vegetation Statistics - Percentile and Threshold Ratio Focus
//
// Outputs:
// NDVI_p10
// NDVI_p90
// NDMI_p10
// NDMI_p90
// NDVI_IQR
// NDMI_IQR
// NDVI_gt_0_5_ratio
// NDVI_gt_0_6_ratio
// NDVI_gt_0_7_ratio
// NDMI_gt_0_2_ratio
// NDMI_gt_0_3_ratio
// NDMI_gt_0_4_ratio
//
// Notes:
// - IQR is calculated as p75 - p25.
// - p25 and p75 are calculated internally but not exported.
// - Threshold ratios are threshold area / Total_Area_ha.
// - NDVI and NDMI are reduced one band at a time for safety.
// ============================================================================


// ---------------------------------------------------------------------------
// 0. SETTINGS
// ---------------------------------------------------------------------------

var START_YEAR = 2003;
var END_YEAR = 2025;

var EXPORT_FOLDER = 'GEE_Exports';

// You confirmed this worked.
var SCALE = 30;
var TILE_SCALE = 8;

var CRS = 'EPSG:4326';

var LULC_ASSET = 'projects/aless-496900/assets/LC_NEW';


// ---------------------------------------------------------------------------
// 1. INPUT DATA
// ---------------------------------------------------------------------------

var adminTable = ee.FeatureCollection(
  'projects/aless-496900/assets/N03-19_07_190101'
);

var fukushima = adminTable
  .filter(ee.Filter.eq('N03_001', '福島県'))
  .geometry()
  .simplify(1000);

var dtrzFC = ee.FeatureCollection(
  'projects/aless-496900/assets/Difficult_to_Return_Zone_DTRZ'
)
.filterBounds(fukushima);

var dtrzGeom = dtrzFC
  .geometry()
  .intersection(fukushima, ee.ErrorMargin(1000))
  .simplify(1000);

// DTRZ + 30 km buffer, clipped to Fukushima.
var studyArea = dtrzGeom
  .buffer(30000, 1000)
  .intersection(fukushima, ee.ErrorMargin(1000))
  .simplify(1000);

Map.centerObject(studyArea, 8);
Map.addLayer(studyArea, {color: 'yellow'}, 'Study Area', false);
Map.addLayer(dtrzGeom, {color: 'blue'}, 'DTRZ', false);


// ---------------------------------------------------------------------------
// 2. LAND USE AND CLASS-ZONE IMAGE
// Correct reclassification of ALOS/AVNIR-2 LULC v16.09
// ---------------------------------------------------------------------------

// Original ALOS v16.09 classes:
// 1  Water
// 2  Built-up
// 3  Paddy
// 4  Cropland
// 5  Grassland
// 6  Deciduous broadleaf forest
// 7  Deciduous needleleaf forest
// 8  Evergreen broadleaf forest
// 9  Evergreen needleleaf forest
// 10 Bare land

var lulcOriginal = ee.Image(LULC_ASSET)
  .select([0])
  .rename('LULC_Original')
  .clip(studyArea)
  .toInt16();

// New analysis classes:
// 1 = Paddy
// 2 = Cropland
// 3 = Forest
// 4 = Grassland
// 5 = Urban

var lulcAnalysis = ee.Image(0)
  .where(lulcOriginal.eq(3), 1)  // Paddy
  .where(lulcOriginal.eq(4), 2)  // Cropland
  .where(
    lulcOriginal.eq(6)
      .or(lulcOriginal.eq(7))
      .or(lulcOriginal.eq(8))
      .or(lulcOriginal.eq(9)),
    3
  )                              // Forest
  .where(lulcOriginal.eq(5), 4)  // Grassland
  .where(lulcOriginal.eq(2), 5)  // Urban
  .updateMask(
    lulcOriginal.eq(3)
      .or(lulcOriginal.eq(4))
      .or(lulcOriginal.eq(5))
      .or(lulcOriginal.eq(6))
      .or(lulcOriginal.eq(7))
      .or(lulcOriginal.eq(8))
      .or(lulcOriginal.eq(9))
      .or(lulcOriginal.eq(2))
  )
  .rename('LULC')
  .toInt16()
  .clip(studyArea);

var insideDTRZ = ee.Image(0)
  .byte()
  .paint(dtrzFC, 1)
  .clip(studyArea)
  .rename('InsideDTRZ');

var zoneCode = insideDTRZ.eq(1).multiply(1)
  .add(insideDTRZ.eq(0).multiply(2))
  .rename('ZoneCode')
  .toInt16();

// 101-105 = Inside
// 201-205 = Outside
var classZone = zoneCode.multiply(100)
  .add(lulcAnalysis)
  .updateMask(lulcAnalysis.mask())
  .rename('ClassZone')
  .toInt16()
  .clip(studyArea);

var classZoneCodes = ee.List([
  101, 201,  // Paddy
  102, 202,  // Cropland
  103, 203,  // Forest
  104, 204,  // Grassland
  105, 205   // Urban
]);

var classNameDict = ee.Dictionary({
  '101': 'Paddy_Inside_Difficult_Return_Zone',
  '201': 'Paddy_Outside_Difficult_Return_Zone',

  '102': 'Cropland_Inside_Difficult_Return_Zone',
  '202': 'Cropland_Outside_Difficult_Return_Zone',

  '103': 'Forest_Inside_Difficult_Return_Zone',
  '203': 'Forest_Outside_Difficult_Return_Zone',

  '104': 'Grassland_Inside_Difficult_Return_Zone',
  '204': 'Grassland_Outside_Difficult_Return_Zone',

  '105': 'Urban_Inside_Difficult_Return_Zone',
  '205': 'Urban_Outside_Difficult_Return_Zone'
});

var landClassDict = ee.Dictionary({
  '101': 'Paddy',
  '201': 'Paddy',

  '102': 'Cropland',
  '202': 'Cropland',

  '103': 'Forest',
  '203': 'Forest',

  '104': 'Grassland',
  '204': 'Grassland',

  '105': 'Urban',
  '205': 'Urban'
});

var zoneNameDict = ee.Dictionary({
  '101': 'Inside_Difficult_Return_Zone',
  '102': 'Inside_Difficult_Return_Zone',
  '103': 'Inside_Difficult_Return_Zone',
  '104': 'Inside_Difficult_Return_Zone',
  '105': 'Inside_Difficult_Return_Zone',

  '201': 'Outside_Difficult_Return_Zone',
  '202': 'Outside_Difficult_Return_Zone',
  '203': 'Outside_Difficult_Return_Zone',
  '204': 'Outside_Difficult_Return_Zone',
  '205': 'Outside_Difficult_Return_Zone'
});


// ---------------------------------------------------------------------------
// 3. GROUPED DICTIONARY HELPERS
// ---------------------------------------------------------------------------

function dictFromGroupedReduction(result, groupName) {
  var groups = ee.List(
    ee.Algorithms.If(
      ee.Dictionary(result).keys().contains('groups'),
      result.get('groups'),
      ee.List([])
    )
  );

  return ee.Dictionary(groups.iterate(function(item, acc) {
    item = ee.Dictionary(item);

    return ee.Dictionary(acc).set(
      ee.Number(item.get(groupName)).format(),
      item
    );
  }, ee.Dictionary({})));
}

function groupedAreaDict(classZoneImg) {
  var areaImage = ee.Image.pixelArea()
    .divide(10000)
    .rename('Area_ha')
    .updateMask(classZoneImg.mask())
    .addBands(classZoneImg.rename('ClassZone'));

  var result = areaImage.reduceRegion({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'ClassZone'
    }),
    geometry: studyArea,
    scale: SCALE,
    crs: CRS,
    maxPixels: 1e13,
    tileScale: TILE_SCALE
  });

  var rawDict = dictFromGroupedReduction(result, 'ClassZone');

  return ee.Dictionary(rawDict.keys().iterate(function(codeStr, acc) {
    codeStr = ee.String(codeStr);
    var item = ee.Dictionary(rawDict.get(codeStr));

    return ee.Dictionary(acc).set(
      codeStr,
      item.get('sum')
    );
  }, ee.Dictionary({})));
}

var totalAreaDict = groupedAreaDict(classZone);

print('Total area by ClassZone', totalAreaDict);


// ---------------------------------------------------------------------------
// 4. LANDSAT PREPROCESSING
// NDVI, NDMI, NBR, and EVI.
// ---------------------------------------------------------------------------

function maskLandsat(img) {
  var qa = img.select('QA_PIXEL');

  var mask = qa.bitwiseAnd(1 << 0).eq(0)  // Fill
    .and(qa.bitwiseAnd(1 << 1).eq(0))     // Dilated cloud
    .and(qa.bitwiseAnd(1 << 3).eq(0))     // Cloud
    .and(qa.bitwiseAnd(1 << 4).eq(0))     // Cloud shadow
    .and(qa.bitwiseAnd(1 << 5).eq(0));    // Snow

  return img.updateMask(mask);
}


// ---------------------------------------------------------------------------
// Index calculation helper
// ---------------------------------------------------------------------------

function makeIndices(blue, red, nir, swir1, swir2) {

  // Denominators
  var ndviDenominator = nir.add(red);
  var ndmiDenominator = nir.add(swir1);
  var nbrDenominator = nir.add(swir2);

  var eviDenominator = nir
    .add(red.multiply(6))
    .subtract(blue.multiply(7.5))
    .add(1);


  // -------------------------------------------------------------------------
  // NDVI
  // Range mask: -1 to 1
  // -------------------------------------------------------------------------

  var ndvi = nir.subtract(red)
    .divide(ndviDenominator)
    .rename('NDVI')
    .updateMask(ndviDenominator.abs().gt(0.000001));

  ndvi = ndvi.updateMask(
    ndvi.gte(-1).and(ndvi.lte(1))
  );


  // -------------------------------------------------------------------------
  // NDMI
  // Range mask: -1 to 1
  // -------------------------------------------------------------------------

  var ndmi = nir.subtract(swir1)
    .divide(ndmiDenominator)
    .rename('NDMI')
    .updateMask(ndmiDenominator.abs().gt(0.000001));

  ndmi = ndmi.updateMask(
    ndmi.gte(-1).and(ndmi.lte(1))
  );


  // -------------------------------------------------------------------------
  // NBR
  // Range mask: -1 to 1
  // -------------------------------------------------------------------------

  var nbr = nir.subtract(swir2)
    .divide(nbrDenominator)
    .rename('NBR')
    .updateMask(nbrDenominator.abs().gt(0.000001));

  nbr = nbr.updateMask(
    nbr.gte(-1).and(nbr.lte(1))
  );


  // -------------------------------------------------------------------------
  // EVI
  // Range mask: -1 to 2
  // -------------------------------------------------------------------------

  var evi = nir.subtract(red)
    .multiply(2.5)
    .divide(eviDenominator)
    .rename('EVI')
    .updateMask(eviDenominator.abs().gt(0.000001));

  evi = evi.updateMask(
    evi.gte(-1).and(evi.lte(2))
  );


  return ee.Image.cat([
    ndvi,
    ndmi,
    nbr,
    evi
  ]);
}


// ---------------------------------------------------------------------------
// Landsat 5 and Landsat 7
//
// Blue  = SR_B1
// Red   = SR_B3
// NIR   = SR_B4
// SWIR1 = SR_B5
// SWIR2 = SR_B7
// ---------------------------------------------------------------------------

function prepL57(img) {
  img = maskLandsat(img);

  var optical = img.select([
    'SR_B1',
    'SR_B3',
    'SR_B4',
    'SR_B5',
    'SR_B7'
  ])
  .multiply(0.0000275)
  .add(-0.2);

  var blue = optical.select('SR_B1');
  var red = optical.select('SR_B3');
  var nir = optical.select('SR_B4');
  var swir1 = optical.select('SR_B5');
  var swir2 = optical.select('SR_B7');

  return makeIndices(
    blue,
    red,
    nir,
    swir1,
    swir2
  )
  .copyProperties(img, ['system:time_start']);
}


// ---------------------------------------------------------------------------
// Landsat 8 and Landsat 9
//
// Blue  = SR_B2
// Red   = SR_B4
// NIR   = SR_B5
// SWIR1 = SR_B6
// SWIR2 = SR_B7
// ---------------------------------------------------------------------------

function prepL89(img) {
  img = maskLandsat(img);

  var optical = img.select([
    'SR_B2',
    'SR_B4',
    'SR_B5',
    'SR_B6',
    'SR_B7'
  ])
  .multiply(0.0000275)
  .add(-0.2);

  var blue = optical.select('SR_B2');
  var red = optical.select('SR_B4');
  var nir = optical.select('SR_B5');
  var swir1 = optical.select('SR_B6');
  var swir2 = optical.select('SR_B7');

  return makeIndices(
    blue,
    red,
    nir,
    swir1,
    swir2
  )
  .copyProperties(img, ['system:time_start']);
}


// ---------------------------------------------------------------------------
// Empty fallback image
// ---------------------------------------------------------------------------

var emptySummerImage = ee.Image.constant([
  0,
  0,
  0,
  0
])
.rename([
  'NDVI',
  'NDMI',
  'NBR',
  'EVI'
])
.updateMask(ee.Image.constant(0));


// ---------------------------------------------------------------------------
// 5. SUMMER COMPOSITE
// ---------------------------------------------------------------------------

function makeSummerComposite(year) {
  year = ee.Number(year);

  var start = ee.Date.fromYMD(year, 6, 1);
  var end = ee.Date.fromYMD(year, 9, 1);

  var l5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
    .filterBounds(studyArea)
    .filterDate(start, end)
    .map(prepL57);

  var l7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
    .filterBounds(studyArea)
    .filterDate(start, end)
    .map(prepL57);

  var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterBounds(studyArea)
    .filterDate(start, end)
    .map(prepL89);

  var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(studyArea)
    .filterDate(start, end)
    .map(prepL89);

  var col = l5
    .merge(l7)
    .merge(l8)
    .merge(l9);

  var composite = ee.Image(
    ee.Algorithms.If(
      col.size().gt(0),
      col.median(),
      emptySummerImage
    )
  );

  return composite
    .select([
      'NDVI',
      'NDMI',
      'NBR',
      'EVI'
    ])
    .clip(studyArea)
    .set('year', year)
    .set(
      'system:time_start',
      ee.Date.fromYMD(year, 7, 15).millis()
    );
}

// ---------------------------------------------------------------------------
// 6. PERCENTILE STATS
// p10, p25, p75, p90 are calculated.
// IQR = p75 - p25.
// ---------------------------------------------------------------------------

var percentileReducer = ee.Reducer.percentile([10, 25, 75, 90]);

function groupedPercentilesForOneBand(image, bandName) {
  var reduceImage = image
    .select([bandName])
    .rename('value')
    .updateMask(classZone.mask())
    .addBands(classZone.rename('ClassZone'));

  var result = reduceImage.reduceRegion({
    reducer: percentileReducer.group({
      groupField: 1,
      groupName: 'ClassZone'
    }),
    geometry: studyArea,
    scale: SCALE,
    crs: CRS,
    maxPixels: 1e13,
    tileScale: TILE_SCALE
  });

  return dictFromGroupedReduction(result, 'ClassZone');
}


// ---------------------------------------------------------------------------
// 7. THRESHOLD AREA RATIO
// One threshold is reduced at a time for safety.
// ---------------------------------------------------------------------------

function groupedThresholdAreaDict(image, bandName, threshold) {
  var thresholdMask = image
    .select([bandName])
    .gt(threshold)
    .and(classZone.mask());

  var areaImage = ee.Image.pixelArea()
    .divide(10000)
    .rename('Area_ha')
    .updateMask(thresholdMask)
    .addBands(classZone.rename('ClassZone'));

  var result = areaImage.reduceRegion({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'ClassZone'
    }),
    geometry: studyArea,
    scale: SCALE,
    crs: CRS,
    maxPixels: 1e13,
    tileScale: TILE_SCALE
  });

  var rawDict = dictFromGroupedReduction(result, 'ClassZone');

  return ee.Dictionary(rawDict.keys().iterate(function(codeStr, acc) {
    codeStr = ee.String(codeStr);
    var item = ee.Dictionary(rawDict.get(codeStr));

    return ee.Dictionary(acc).set(
      codeStr,
      item.get('sum')
    );
  }, ee.Dictionary({})));
}


// ---------------------------------------------------------------------------
// 8. PHASE 2 FEATURES BY YEAR
// ---------------------------------------------------------------------------

function safeGetNumber(dict, key, defaultValue) {
  return ee.Number(
    ee.Algorithms.If(
      ee.Dictionary(dict).keys().contains(key),
      ee.Dictionary(dict).get(key),
      defaultValue
    )
  );
}

function safeGetDict(dict, key) {
  return ee.Dictionary(
    ee.Algorithms.If(
      ee.Dictionary(dict).keys().contains(key),
      ee.Dictionary(dict).get(key),
      ee.Dictionary({})
    )
  );
}

function areaRatio(areaDict, codeStr, totalArea) {
  var area = ee.Number(
    ee.Algorithms.If(
      ee.Dictionary(areaDict).keys().contains(codeStr),
      ee.Dictionary(areaDict).get(codeStr),
      0
    )
  );

  return ee.Algorithms.If(
    ee.Number(totalArea).gt(0),
    area.divide(totalArea),
    null
  );
}

function phase2FeaturesForYear(year) {
  year = ee.Number(year);

  var image = makeSummerComposite(year);

  // Percentiles
  var ndviPctDict = groupedPercentilesForOneBand(image, 'NDVI');
  var ndmiPctDict = groupedPercentilesForOneBand(image, 'NDMI');

  // NDVI threshold areas
  var ndviGt05AreaDict = groupedThresholdAreaDict(image, 'NDVI', 0.5);
  var ndviGt06AreaDict = groupedThresholdAreaDict(image, 'NDVI', 0.6);
  var ndviGt07AreaDict = groupedThresholdAreaDict(image, 'NDVI', 0.7);

  // NDMI threshold areas
  var ndmiGt02AreaDict = groupedThresholdAreaDict(image, 'NDMI', 0.2);
  var ndmiGt03AreaDict = groupedThresholdAreaDict(image, 'NDMI', 0.3);
  var ndmiGt04AreaDict = groupedThresholdAreaDict(image, 'NDMI', 0.4);

  return ee.FeatureCollection(classZoneCodes.map(function(code) {
    code = ee.Number(code);
    var codeStr = code.format();

    var totalArea = ee.Number(
      ee.Algorithms.If(
        totalAreaDict.keys().contains(codeStr),
        totalAreaDict.get(codeStr),
        0
      )
    );

    var ndviPct = safeGetDict(ndviPctDict, codeStr);
    var ndmiPct = safeGetDict(ndmiPctDict, codeStr);

    var ndviP10 = safeGetNumber(ndviPct, 'p10', null);
    var ndviP25 = safeGetNumber(ndviPct, 'p25', null);
    var ndviP75 = safeGetNumber(ndviPct, 'p75', null);
    var ndviP90 = safeGetNumber(ndviPct, 'p90', null);

    var ndmiP10 = safeGetNumber(ndmiPct, 'p10', null);
    var ndmiP25 = safeGetNumber(ndmiPct, 'p25', null);
    var ndmiP75 = safeGetNumber(ndmiPct, 'p75', null);
    var ndmiP90 = safeGetNumber(ndmiPct, 'p90', null);

    var ndviIQR = ee.Algorithms.If(
      ndviPct.keys().contains('p75'),
      ndviP75.subtract(ndviP25),
      null
    );

    var ndmiIQR = ee.Algorithms.If(
      ndmiPct.keys().contains('p75'),
      ndmiP75.subtract(ndmiP25),
      null
    );

    return ee.Feature(null, {
      'Year': year,
      'Season': 'Summer',
      'Analysis': 'Research1_Phase2_Percentile_Threshold_Ratio',

      'Land_Class': landClassDict.get(codeStr),
      'Zone': zoneNameDict.get(codeStr),
      'ClassZone_Code': code,
      'Class_Name': classNameDict.get(codeStr),

      'Total_Area_ha': totalArea,

      'NDVI_p10': ndviP10,
      'NDVI_p90': ndviP90,
      'NDMI_p10': ndmiP10,
      'NDMI_p90': ndmiP90,

      'NDVI_IQR': ndviIQR,
      'NDMI_IQR': ndmiIQR,

      'NDVI_gt_0_5_ratio': areaRatio(ndviGt05AreaDict, codeStr, totalArea),
      'NDVI_gt_0_6_ratio': areaRatio(ndviGt06AreaDict, codeStr, totalArea),
      'NDVI_gt_0_7_ratio': areaRatio(ndviGt07AreaDict, codeStr, totalArea),

      'NDMI_gt_0_2_ratio': areaRatio(ndmiGt02AreaDict, codeStr, totalArea),
      'NDMI_gt_0_3_ratio': areaRatio(ndmiGt03AreaDict, codeStr, totalArea),
      'NDMI_gt_0_4_ratio': areaRatio(ndmiGt04AreaDict, codeStr, totalArea)
    });
  }));
}


// ---------------------------------------------------------------------------
// 9. BUILD FEATURE COLLECTION
// ---------------------------------------------------------------------------

var years = ee.List.sequence(START_YEAR, END_YEAR);

var phase2FC = ee.FeatureCollection(
  years.map(function(year) {
    return phase2FeaturesForYear(year);
  })
).flatten();

print('Phase 2 output preview', phase2FC.limit(20));


// ---------------------------------------------------------------------------
// 10. EXPORT
// ---------------------------------------------------------------------------

Export.table.toDrive({
  collection: phase2FC,
  description: 'Summer_Vegetation_Statistics_Phase2',
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'Summer_Vegetation_Statistics_Phase2',
  fileFormat: 'CSV',
  selectors: [
    'Year',
    'Season',
    'Analysis',
    'Land_Class',
    'Zone',
    'ClassZone_Code',
    'Class_Name',

    'Total_Area_ha',

    'NDVI_p10',
    'NDVI_p90',
    'NDMI_p10',
    'NDMI_p90',

    'NDVI_IQR',
    'NDMI_IQR',

    'NDVI_gt_0_5_ratio',
    'NDVI_gt_0_6_ratio',
    'NDVI_gt_0_7_ratio',

    'NDMI_gt_0_2_ratio',
    'NDMI_gt_0_3_ratio',
    'NDMI_gt_0_4_ratio'
  ]
});

print('Export prepared: Summer_Vegetation_Statistics_Phase2');

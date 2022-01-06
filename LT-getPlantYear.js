var planted = ee.Image("users/duzhenrong/SDPT/sdpt"),
    grids = ee.FeatureCollection("users/duzhenrong/SDPT/grids");
var study_area=grids;
var startYear=1982;
//----------functions-----------//
function maskL8sr(image) {
  // Bits 3 and 5 are cloud shadow and cloud, respectively.
  var cloudShadowBitMask = (1 << 3);
  var cloudsBitMask = (1 << 5);
  // Get the pixel QA band.
  var qa = image.select('pixel_qa');
  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
                .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
  return image.updateMask(mask);
};
var cloudMaskL457 = function(image) {
  var qa = image.select('pixel_qa');
  // If the cloud bit (5) is set and the cloud confidence (7) is high
  // or the cloud shadow bit is set (3), then it's a bad pixel.
  var cloud = qa.bitwiseAnd(1 << 5)
                  .and(qa.bitwiseAnd(1 << 7))
                  .or(qa.bitwiseAnd(1 << 3));
  // Remove edge pixels that don't occur in all bands
  var mask2 = image.mask().reduce(ee.Reducer.min());
  return image.updateMask(cloud.not()).updateMask(mask2);
};
//Function used to calculate NDVI & NBR
var getL8ND = function(img) {
  var b5=img.select('B5');
  b5=b5.multiply(0.8339).add(0.0448);
  var b7=img.select('B7');
  b7=b7.multiply(0.9165).add(0.0116);
  var etm=b5.addBands(b7);
  var nbr = etm.normalizedDifference().rename('NBR');
  return nbr.set('system:time_start', img.get('system:time_start'));
};
var getL457ND = function(img) {
  var nbr = img.normalizedDifference(['B4', 'B7']).rename('NBR');
  return nbr.set('system:time_start', img.get('system:time_start'));
};

//----------load landsat---------//
for(var year=startYear;year<=2020;year++)
{
  var l4_col = ee.ImageCollection('LANDSAT/LT04/C01/T1_SR')
                  .filterDate(year+'-06-01', year+'-09-01')
                  .map(cloudMaskL457).map(getL457ND);
  var l5_col = ee.ImageCollection('LANDSAT/LT05/C01/T1_SR')
                  .filterDate(year+'-06-01', year+'-09-01')
                  .map(cloudMaskL457).map(getL457ND);
  var l7_col = ee.ImageCollection('LANDSAT/LE07/C01/T1_SR')
                .filterDate(year+'-06-01', year+'-09-01')
                .map(cloudMaskL457).map(getL457ND);
  var l8_col = ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
                .filterDate(year+'-06-01', year+'-09-01')
                .map(maskL8sr).map(getL8ND);
  var lan_col=l4_col.merge(l5_col).merge(l7_col).merge(l8_col);
  var nbrYear=lan_col.select('NBR').max();
  var nbrOrg=nbrYear;
  nbrYear=nbrYear.expression('nbr>=-1&&nbr<=1?nbr:-2',{'nbr':nbrYear})
            .set('system:time_start', ee.Date(year+'-02-01').millis());
  if(year==startYear){
    var nbrYears=ee.ImageCollection([nbrYear]);
    var nbrOrgs=ee.ImageCollection([nbrOrg]);
  }
  else{
    nbrYears=nbrYears.merge(nbrYear);
    nbrOrgs=nbrOrgs.merge(nbrOrg);
  }
}

var increase = ee.Date('1992-01-01').millis().subtract(ee.Date('1991-01-01').millis());
var nbrMosaic=nbrOrgs.sort('system:time_start').mosaic()
var nbr2020=nbrYears.filter(ee.Filter.eq('system:time_start',ee.Date('2020-02-01').millis())).first();
nbr2020=nbr2020.expression('n==-2&&m>=-1&&m<=1?m:n',{
  'n':nbr2020,
  'm':nbrMosaic
})
var accumulate = function(image, list) {
  var time=ee.Number(image.get('system:time_start'));
  var yearM1=nbrYears.filterDate(ee.Date(time.subtract(increase)).advance(-1, 'month'),ee.Date(time.subtract(increase)).advance(1, 'month')).first();
  var yearA1=ee.Image(ee.List(list).get(-1));
  var imageCheck=image.expression('nbr!=-2?nbr:(ym1!=-2&&ya1!=-2?(ym1+ya1)/2:(ym1!=-2?ym1:ya1))',{
    'nbr':image,
    'ym1':yearM1,
    'ya1':yearA1
  }).set('system:time_start',time);
  return ee.List(list).add(imageCheck);
}
var first = ee.List([nbr2020]);
var checkCol=nbrYears.filterDate('1983-01-01','2019-12-31').sort('system:time_start',false);
var check = ee.ImageCollection(ee.List(checkCol.iterate(accumulate, first)));
var startYearImg=nbrYears.filter(ee.Filter.eq('system:time_start',ee.Date('1982-02-01').millis())).first();
var startYearCheckImg=startYearImg.expression('nbr!=-2?nbr:pre',{
  'nbr':startYearImg,
  'pre':check.filter(ee.Filter.eq('system:time_start',ee.Date('1983-02-01').millis())).first()
}).set('system:time_start',ee.Date('1982-02-01').millis());
check=check.merge(startYearCheckImg);
nbrYears=check.sort('system:time_start');
nbrYears=nbrYears.map(function(img){
  var time=img.get('system:time_start')
  img=img.expression('planted>0?img:0',{
    'planted':planted,
    'img':img
  }).clip(study_area).set('system:time_start',time);
  return img;
})

//-----------LandTrendr------------//
var years=["1982","1983","1984","1985","1986","1987","1988","1989","1990","1991","1992","1993",
            "1994","1995","1996","1997","1998","1999","2000","2001","2002","2003","2004",
            "2005","2006","2007","2008","2009","2010","2011","2012","2013","2014","2015",
            "2016","2017","2018","2019","2020"];
var maxSeg=10;
var landTrendr=ee.Algorithms.TemporalSegmentation.LandTrendr({
                timeSeries:nbrYears,
                maxSegments:maxSeg,
                spikeThreshold:0.9,
                vertexCountOvershoot:3,
                preventOneYearRecovery:false,
                recoveryThreshold:1,
                pvalThreshold:0.05,
                bestModelProportion:0.75
              });
var lt=landTrendr.select('LandTrendr').clip(study_area);
var vertexMask = lt.arraySlice(0, 3, 4);
var vertices = lt.arrayMask(vertexMask);
var ltFits=lt.arraySlice(0,2,3).arrayProject([1]).arrayFlatten([years]);
// construct segment start and end point years and index values
var left = vertices.arraySlice(1, 0, -1);    // slice out the vertices as the start of segments
var right = vertices.arraySlice(1, 1, null); // slice out the vertices as the end of segments
var startyear = left.arraySlice(0, 0, 1);    // get year dimension of LT data from the segment start vertices
var startVal = left.arraySlice(0, 2, 3);     // get spectral index dimension of LT data from the segment start vertices
var endYear = right.arraySlice(0, 0, 1);     // get year dimension of LT data from the segment end vertices 
var endVal = right.arraySlice(0, 2, 3);      // get spectral index dimension of LT data from the segment end vertices
var dur = endYear.subtract(startyear);       // subtract the segment start year from the segment end year to calculate the duration of segments 
var mag = endVal.subtract(startVal);         // substract the segment start index value from the segment end index value to calculate the delta of segments
var distImg = ee.Image.cat([startyear, mag, dur]).toArray(0);
var distImgSorted = distImg.arraySort(startyear.multiply(-1));
var vertexSum=vertexMask.arrayReduce(ee.Reducer.sum(), [1]).arrayProject([1]).arrayFlatten([['sum']]);
distImgSorted=distImgSorted.updateMask(vertexSum.gt(2))

//--------------basic
var distImgMagSorted = distImg.arraySort(mag.multiply(-1));
var tempDistImg = distImgMagSorted.arraySlice(1, 0, 1).unmask(ee.Image(ee.Array([[0],[0],[0],[0],[0],[0],[0]])));
var firstDistImg = ee.Image.cat(tempDistImg.arraySlice(0,0,1).arrayProject([1]).arrayFlatten([['preYear']]), 
                                tempDistImg.arraySlice(0,2,3).arrayProject([1]).arrayFlatten([['mag']]),
                                tempDistImg.arraySlice(0,3,4).arrayProject([1]).arrayFlatten([['dur']]));
var sdptGainYear=ee.Image(0).clip(study_area);
for(var year=startYear;year<=2020;year++){
  var preYear=firstDistImg.select('preYear');
  sdptGainYear=sdptGainYear.expression('mag<0?1981:(sg==0&&y==py?y:sg)',{
    'sg':sdptGainYear,
    'mag':firstDistImg.select('mag'),
    'y':ee.Image(year).clip(study_area),
    'py':preYear
  });
}
sdptGainYear=sdptGainYear.clip(study_area).updateMask(planted.gt(0));

//--------------first
var tempDistImg = distImgSorted.arraySlice(1, 0, 1).unmask(ee.Image(ee.Array([[0],[0],[0]])));
var firstDistImg = ee.Image.cat(tempDistImg.arraySlice(0,0,1).arrayProject([1]).arrayFlatten([['preYear']]), 
                                tempDistImg.arraySlice(0,2,3).arrayProject([1]).arrayFlatten([['mag']]),
                                tempDistImg.arraySlice(0,3,4).arrayProject([1]).arrayFlatten([['dur']]));
firstDistImg=firstDistImg.updateMask(firstDistImg.select('mag').gt(0.2));
var firstGainYear=ee.Image(0).clip(study_area);
for(var year=startYear;year<=2020;year++){
  var preYear=firstDistImg.select('preYear');
  firstGainYear=firstGainYear.expression('fg==0&&y==py&&dur>1?y:fg',{
    'fg':firstGainYear,
    'y':ee.Image(year).clip(study_area),
    'dur':firstDistImg.select('dur'),
    'py':preYear
  });
}
var firstgainYear=firstGainYear.clip(study_area);
var gainYear=firstgainYear
//----------secondToTenth
for (var i=2;i<=10;i++)
{
  var tempDistImg = distImgSorted.updateMask(vertexSum.gt(i)).arraySlice(1, i-1, i).unmask(ee.Image(ee.Array([[0],[0],[0]])));
  var distImg = ee.Image.cat(tempDistImg.arraySlice(0,0,1).arrayProject([1]).arrayFlatten([['preYear']]), 
                                  tempDistImg.arraySlice(0,2,3).arrayProject([1]).arrayFlatten([['mag']]),
                                  tempDistImg.arraySlice(0,3,4).arrayProject([1]).arrayFlatten([['dur']]));
  distImg=distImg.updateMask(distImg.select('mag').gt(0.2));
  var GainYear=ee.Image(0).clip(study_area);
  for(var year=startYear;year<=2020;year++){
    var preYear=distImg.select('preYear');
    GainYear=GainYear.expression('fg==0&&y==py&&dur>1?y:fg',{
      'fg':GainYear,
      'y':ee.Image(year).clip(study_area),
      'dur':distImg.select('dur'),
      'py':preYear
    });
  }
  GainYear=GainYear.clip(study_area);
  gainYear=gainYear.expression('g>0?g:(gy>0?gy:g)',{
    'g':gainYear,
    'gy':GainYear
  }).updateMask(planted.gt(0))
}
//----------mosaic----------//
var gainYearFinal=ee.Image(0).expression('sdpt>0&&(gy==0)?sdpt:gy',{
  'gy':gainYear,
  'sdpt':sdptGainYear
}).clip(study_area);
gainYearFinal=gainYearFinal.reduceNeighborhood(ee.Reducer.mode(), ee.Kernel.square(30,'meters'),'kernel',false);
gainYearFinal=gainYearFinal.updateMask(planted.gt(0));

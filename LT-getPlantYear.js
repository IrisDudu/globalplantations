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
  if (year>=2013){
    lan_col=lan_col.filterDate(year+'-06-01', year+'-09-01');
  }
  var nbrYear=lan_col.select('NBR').max();
  nbrYear=nbrYear.expression('nbr>=-1&&nbr<=1?nbr:-2',{'nbr':nbrYear})
            .set('system:time_start', ee.Date(year+'-02-01').millis());
  if(year==startYear){
    var nbrYears=ee.ImageCollection([nbrYear]);
  }
  else{
    nbrYears=nbrYears.merge(nbrYear);
  }
}

var increase = ee.Date('1992-01-01').millis().subtract(ee.Date('1991-01-01').millis());
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
var first = ee.List([
  nbrYears.filter(ee.Filter.eq('system:time_start',ee.Date('2020-02-01').millis())).first();
]);
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
                                tempDistImg.arraySlice(0,3,4).arrayProject([1]).arrayFlatten([['dur']]);
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
sdptGainYear=sdptGainYear.clip(study_area);

//--------------first
var tempDistImg = distImgSorted.arraySlice(1, 0, 1).unmask(ee.Image(ee.Array([[0],[0],[0]])));
var firstDistImg = ee.Image.cat(tempDistImg.arraySlice(0,0,1).arrayProject([1]).arrayFlatten([['preYear']]), 
                                tempDistImg.arraySlice(0,2,3).arrayProject([1]).arrayFlatten([['mag']]),
                                tempDistImg.arraySlice(0,3,4).arrayProject([1]).arrayFlatten([['dur']]);
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
//--------------second
var tempDistImg = distImgSorted.arraySlice(1, 1, 2).unmask(ee.Image(ee.Array([[0],[0],[0]])));
var secondDistImg = ee.Image.cat(tempDistImg.arraySlice(0,0,1).arrayProject([1]).arrayFlatten([['preYear']]), 
                                tempDistImg.arraySlice(0,2,3).arrayProject([1]).arrayFlatten([['mag']]),
                                tempDistImg.arraySlice(0,3,4).arrayProject([1]).arrayFlatten([['dur']]);
secondDistImg=secondDistImg.updateMask(secondDistImg.select('mag').gt(0.2));
var secondGainYear=ee.Image(0).clip(study_area);
for(var year=startYear;year<=2020;year++){
  var preYear=secondDistImg.select('preYear');
  secondGainYear=secondGainYear.expression('fg==0&&y==py&&dur>1?y:fg',{
    'fg':secondGainYear,
    'y':ee.Image(year).clip(study_area),
    'dur':secondDistImg.select('dur'),
    'py':preYear
  });
}
var secondgainYear=secondGainYear.clip(study_area);
//--------------third
var tempDistImg = distImgSorted.updateMask(vertexSum.gt(3)).arraySlice(1, 2, 3)
                    .unmask(ee.Image(ee.Array([[0],[0],[0]])));
var thirdDistImg = ee.Image.cat(tempDistImg.arraySlice(0,0,1).arrayProject([1]).arrayFlatten([['preYear']]), 
                                tempDistImg.arraySlice(0,2,3).arrayProject([1]).arrayFlatten([['mag']]),
                                tempDistImg.arraySlice(0,3,4).arrayProject([1]).arrayFlatten([['dur']]);
thirdDistImg=thirdDistImg.updateMask(thirdDistImg.select('mag').gt(0.2));
var thirdGainYear=ee.Image(0).clip(study_area);
for(var year=startYear;year<=2020;year++){
  var preYear=thirdDistImg.select('preYear');
  thirdGainYear=thirdGainYear.expression('fg==0&&y==py&&dur>1?y:fg',{
    'fg':thirdGainYear,
    'y':ee.Image(year).clip(study_area),
    'py':preYear,
    'dur':thirdDistImg.select('dur')
  });
}
var thirdgainYear=thirdGainYear.clip(study_area);
//--------------forth
var tempDistImg = distImgSorted.updateMask(vertexSum.gt(4)).arraySlice(1, 3, 4);
                    .unmask(ee.Image(ee.Array([[0],[0],[0]])));
var forthDistImg = ee.Image.cat(tempDistImg.arraySlice(0,0,1).arrayProject([1]).arrayFlatten([['preYear']]), 
                                tempDistImg.arraySlice(0,2,3).arrayProject([1]).arrayFlatten([['mag']]),
                                tempDistImg.arraySlice(0,3,4).arrayProject([1]).arrayFlatten([['dur']]);
forthDistImg=forthDistImg.updateMask(forthDistImg.select('mag').gt(0.2));
var forthGainYear=ee.Image(0).clip(study_area);
for(var year=startYear;year<=2020;year++){
  var preYear=forthDistImg.select('preYear');
  forthGainYear=forthGainYear.expression('fg==0&&y==py&&dur>1?y:fg',{
    'fg':forthGainYear,
    'y':ee.Image(year).clip(study_area),
    'py':preYear,
    'dur':forthDistImg.select('dur')
  });
}
var forthgainYear=forthGainYear.clip(study_area);
//-----------final
var gainYear=firstgainYear.expression('f>0?f:(s>0?s:(t>0?t:(fo>0?fo:0)))',{
  'f':firstgainYear,
  's':secondgainYear,
  't':thirdgainYear,
  'fo':forthgainYear
});

//----------mosaic----------//
var gainYearFinal=ee.Image(0).expression('sdpt>0&&(gy==0)?sdpt:gy',{
  'gy':gainYear,
  'sdpt':sdptGainYear
}).clip(study_area);
gainYearFinal=gainYearFinal.reduceNeighborhood(ee.Reducer.mode(), ee.Kernel.square(30,'meters'),'kernel',false);
gainYearFinal=gainYearFinal.updateMask(planted.gt(0));

//----------export------------//
var list_eco=[114,115,116,123,124,125,126,138,139,141,142,163,164,165,60,65,73,74,75,78,85,86,87,88,
              89,90,91,96,97,98,99,100,101,102,109,111,112,113,31,47,48,51,56,59,72,76,77,110,121,122,
              140,152,162,177,191,192,193,198,199,200,203,204,205,0,5,6,8,9,10,11,20,21,22,41,172,217,
              233,234,235,236,237,238,194,195,201,272,273,274,275,1,2,7,12,151,170,171,173,196,197,206,
              207,186,187,271,308,17,18,28,168,178,181,182,202,185,14,15,19,32,33,35,37,38,39,71,95,108,
              127,135,136,137,148,149,150,161,169,179,180,13,16,29,30,34,40,49,50,53,54,55,61,62,63,64,
              79,80,81,82,103,104,105,106,107,129,130,131,132,133,134];
for(var i=0;i<list_eco.length;i++){
  var index=list_eco[i];
  var roi = grids.filter(ee.Filter.eq('Id',index)).geometry();
  Export.image.toAsset({
    image: gainYearFinal.updateMask(gainYearFinal.gt(0)).clip(roi),
    description: 'plantYear_'+index.toString(),
    assetId: 'SDPT_NEW/plantYear_'+index.toString(),
    pyramidingPolicy:{'.default': 'mode'},
    scale: 30,
    region: roi,
    maxPixels:1e13
  });
}

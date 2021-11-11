# Generate planting year maps of global plantations
JS code and valid samples for mapping planting years of global plantations in Google Earth Engine.

In this study, based on the latest global plantation extent dataset, the planting years have been mapped at a 30m resolution using Landsat imagery. The global plantation extent dataset was composed by Spatial Database of Planted Trees (SDPT) product (https://www.wri.org/research/spatial-database-planted-trees-sdpt-version-10) and Descales's oil palm maps (https://doi.org/10.5281/zenodo.4473715), including plantation forests and tree crops. Taking advantages of Google Earth Engine (GEE), we developed a method to detect the year of the planting event using LandTrendr algorithm and the spectral time series spanning from 1982 to 2020. Furthermore, to evaluate the accuracy of our planting year map, we compared it with other planting year products scattered in parts of the world, i.e., Danylo's oil palm planting year product (https://dare.iiasa.ac.at/85/) and Chen's orchard planting year product in California (https://doi.org/10.1016/j.isprsjprs.2019.03.012).

![image](![global](https://user-images.githubusercontent.com/24910927/141221368-577564fa-2628-4659-8a7c-a54c60a7e505.jpg))

## View online maps using GEE experimental app
https://duzhenrong.users.earthengine.app/view/globalplantationyear
![image](<img width="1920" alt="截屏2021-11-11 上午9 33 52" src="https://user-images.githubusercontent.com/24910927/141221288-10a45c25-079e-446f-8f07-bb1db9ca0ae2.png">)




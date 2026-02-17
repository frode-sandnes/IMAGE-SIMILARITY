// By Frode Eika Sandne, February, 2025.

// globals
let imageGroups = null;

let loadCounter = 0;
function activateCombineButton()
    {
    loadCounter++;
    if (loadCounter > 1)
        {                
        document.getElementById("combine-button").style.display = "block";
        }         
    }


// Essential utility functions borrowed
function outputJson(jsonObject, outputFilename)
    {
    saveTextFile(JSON.stringify(jsonObject, null, 2), outputFilename+".json");
    }
// using the fileSave library to output file  
function saveTextFile(text, filename)  
    {
    const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
    saveAs(blob, filename);
    }
// bare bone gui borrowed
window.addEventListener('DOMContentLoaded', (event) => setup());

async function setup()
    {
    if (null == document.getElementById("file-selector-json"))
        {
        return;
        }
    // Add GUI handlers
    document.getElementById("file-selector-json")
            .addEventListener('change', (event) => loadFilesJson(event)); 
    }


const minThreshold = 0.72;

// retrieving file contents of JSON files
function loadFilesJson(event)
    {     
    const files = event.target.files;
    for (var i = 0, file; file = files[i]; i++) 
        {		
        var reader = new FileReader();
   
        reader.onload = (function(theFile) 
            {
            return function(e) 
                {  
                // read file into json og parse
                let json = JSON.parse(e.target.result);

                filterSmallImages(json)
                    .then(json => unifiedDownSampling(json))
                    .then(json => firstClusteringPass(json))
                    .then(results => keepValidClusters(results))
                    .then(({clusters, histograms, json, fuzzyClusters}) => 
                        {
                        let borrowedImages = findBorrowedImages(clusters);
                        console.log(`Found ${clusters.length} clusters with ${clusters.flat().length} images!`);
                         let {studentGroups, individualStudents} = findStudentGroups(clusters, json); 

                        // update GUI
                        activateCombineButton();
                        // populate the globals
                        imageGroups = studentGroups;
                        })
                };
            })(file);		
        reader.readAsText(file);
        }
    }

// find potentially borrowed images which require manual inspection for creditaiton practicer
function findBorrowedImages(clusters)
    {
    return clusters.filter(cluster => cluster.length > maxGroupSize);    
    }
// as illustrative example
function outputBorrowedImages(borrowedImages, json)
    {
    let info = "";
    borrowedImages.forEach((cluster, i) => 
        {
        info += `\nBorrowed image case ${i+1}\n`;
        cluster.forEach((imageIdx, j) => 
            {
            let record= json[imageIdx];
            info += `${j+1}: ${record.name} (page ${record.page})\n`;
            })
        });    
    console.log(info);
    }


// find potential student groups from image clusters
function findStudentGroups(clusters, json)
    {
    // Convert cluster indices to (file) names.
    let nameClusters = clusters.filter(cluster => cluster.length <= maxGroupSize)   // do not consider very large clusters that are not due to group work, e.g. using reference images.
                               .map(cluster => cluster.map(index => json[index].name)); 
    let recurringNamesSet = new Set();                         
    // create name mappings to cluster
    let nameMapping = {};
    nameClusters.forEach((cluster, clusterIndex) => 
        {
        cluster.forEach(name => 
            {
            if (!(name in nameMapping))
                {
                nameMapping[name] = [];
                }
            nameMapping[name].push(clusterIndex);
            if (nameMapping[name].length > 1)
                {
                recurringNamesSet.add(name);    
                }
            });
        });
    // merge the groups with recurring names, and discard the respective parts
    let mergedGroups = [];
    let processed = new Set();
    nameClusters.forEach((cluster,i) => 
        {
        if (processed.has(i))
            {
            return;
            }
        let clusterSet = new Set(cluster);
        let recurringMembers = clusterSet.intersection(recurringNamesSet);
        if (recurringMembers.size < 1)
            {
            mergedGroups.push(cluster);    
            processed.add(i);
            }
        else
            {
            let toMerge = [...recurringMembers].flatMap(member => nameMapping[member]);
            toMerge = [...new Set(toMerge)];   // ensure uniqueness
            if (toMerge.size > maxGroupSize)    // if result becomes too large we do not merge
                {
                mergedGroups.push(cluster);    
                processed.add(i);
                return;    
                }
            let mergedSet = toMerge.reduce((accumulator, index) => 
                {
                let partToMerge = new Set(nameClusters[index]);
                return accumulator.union(partToMerge);
                }, new Set());
            mergedGroups.push([...mergedSet]);                
            processed = processed.union(new Set(toMerge));              
            }
        });
// shortcut to disable
//mergedGroups = nameClusters;
    // identify students that are not part of clusters.
    let allNamesSet = new Set(json.map(({name}) => name));
    let clusterMembers = new Set(mergedGroups.filter(cluster => cluster.length > 1).reduce((accumulator, cluster) => accumulator.union(new Set(cluster)), new Set()));
    let withoutGroup = [...allNamesSet.difference(clusterMembers)];
    console.log(`Merged ${clusters.length} overlapping groups into ${mergedGroups.length} groups encompassing ${clusterMembers.size} students (total ${allNamesSet.size} students), where ${withoutGroup.length} students could not be mapped to any groups.`)
    return {studentGroups:mergedGroups, individualStudents:withoutGroup};
    }

// making fuzzy clusters for images that are similar but not indentical
// Based on quantizing the color profiles and create hsigrams of the results.
// This idea does not work .... abandon - using the initially identifed results instead.
function fuzzyImageClusters(histograms)
    {
    // quantize histograms
    let quantized = histograms.map(histogram => histogram.map(value => (value / 10).toFixed(0)));
    // remember mapping
    let mapping = quantized.reduce((accumulator, histogram, index) => 
        {
        if (!(histogram in accumulator))
            {
            accumulator[histogram] = [];
            }
        accumulator[histogram].push(index);
        return accumulator;
        },{});
//console.log(quantized, mapping)  
    // "cluster" through histogram of profiles
    let histogram = Object.groupBy(quantized, (histogram => histogram.join("-")));
//console.log(histogram);
    // convert profile clusters to indices.
    let fuzzyClusters = Object.keys(histogram)
            .map(key => histogram[key])
            .map(profiles => profiles.map(profile => mapping[profile]))
            .map(indicesList => indicesList[0]); // reduce one array level
console.log(fuzzyClusters);            
    return fuzzyClusters;
    }


// the quick first pass for main image clustering.
function firstClusteringPass(json)
    {
    return new Promise(resolve => 
        {
        let clusterInfo = clusterImages(json);
        processClusters(clusterInfo)
            .then(result => 
                {
                // add initial clustering results as fuzzy clusters 
                result["fuzzyClusters"] = clusterInfo.imageClusterIndices;
                resolve(result);
                });  
        });
    }


function checkSize(threshold, imageURLdata)
    {
    return new Promise((resolve) => 
        {
        let image = new Image();
        image.onload = function () 
            {
            // filter images that are too small
            const valid = image.width > threshold && image.height > threshold;
            resolve(valid);
            }
        image.onerror = function () 
            {
            resolve(false);
            }            
        image.src = imageURLdata;   
        }); 
    }
// filter very small images
function filterSmallImages(json)
    {
    return new Promise((resolve) => 
        {
        console.log(`Downsampling ${json.length} images....(slow)`);
        let promises = json.map((o, i) => checkSize(pixels, o.imageURL));
        Promise.all(promises)
            .then(results => 
                {       
                // remove images that were flagged as too small        
                newJson = json.filter((e,i) => results[i]);  
                resolve(newJson);
                });
        });
    }


// reduce all images to 100 x 100 pixel images for easy comparison
const pixels = 100; // pixel * pixel images
function unifiedDownSampling(json)
    {
    return new Promise((resolve) => 
        {
// for exploring invalid images - interresting results, but not advisable to filter based on dimensions - most images are valid
/*let x = json.map(({imageWidth}) => imageWidth).toSorted((a,b) => a - b);
let y = json.map(({imageHeight}) => imageHeight).toSorted((a,b) => a - b);   
let a = json.map(({imageWidth, imageHeight}) => imageWidth/imageHeight).toSorted((a,b) => b - a);
//console.log(a, x, y);
let bad = json.reduce((accumulator, {imageWidth, imageHeight}, index) => 
    {
    let ar = imageWidth/imageHeight;
    ar = (ar < 1)? 1 / ar: ar;  // possibly invert 
    if (ar > 10)    // threshold
        {
        accumulator.push(index);    
        }
    return accumulator;
    }, []);
console.log(bad);
viewSelectedImage(bad,json);
throw "Look at arrays!"  
*/
        console.log(`Downsampling ${json.length} images....(slow)`);
        let promises = json.map((o, i) => downSampleImage(pixels, o.imageURL));
        Promise.all(promises)
            .then(results => 
                {                 
                results.forEach((result, j) => 
                    {
                    json[j].imageData = result;
                    json[j].aspectRatio = json[j].imageWidth / json[j].imageHeight;
                    json[j].imageHeight = pixels; 
                    json[j].imageWidth = pixels; 
                    json[j].page++; // page numbers are zero indexed - add one to make output compatible with page number in viewing tools 
                    });
                resolve(json);
                });
        });
    }

function downSampleImage(pixels, imageURLdata)
    {
    return new Promise((resolve) => 
        {
        let image = new Image();
        image.onload = function () 
            {
            createImageBitmap(image,
                    { resizeWidth: pixels, resizeHeight: pixels, resizeQuality: 'high' })
            .then(imageBitmap => 
                {
                let canvas = document.createElement("canvas");
                canvas.height = pixels;
                canvas.width = pixels;
                let ctx = canvas.getContext("2d");
                ctx.drawImage(imageBitmap, 0, 0);
                let result = ctx.getImageData(0, 0, pixels, pixels);
                resolve(result);
                });
            }
        image.src = imageURLdata;   
        }); 
    }


const similarityThreshold = 1000; // Adjust this value as needed
 
function colorString(colorHistogram)
    {
    const colors = Object.keys(colorHistogram);
    const rep = colors.map(color => colorHistogram[color])
                      .map(count => (""+Math.round(count/10)).padStart(3, '0'))
                      .join("-");                   
    return rep;
    }



// 100 is very generous and relaxed - also 50. in huge case perhaps must be stricter
const epsilon = 100;  // max distance between points in cluster
//const epsilon = 50;  // max distance between points in cluster
const minimalRegionSize = 1; // If a region for a point is lesser than min, this point will be considered as noise (cannot be included in any group).
    
const colors = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'blackish', 'greyish', 'whiteish'];    
function toVector(colorHistogram)
    {
//    const colors = Object.keys(colorHistogram);
    const frequencies = colors.map(color => colorHistogram[color])
                              .map(frequency => frequency < epsilon && frequency > 0 ? frequency + epsilon*2: frequency);  // introduce bias to discriminate between different color profiles
    return frequencies;        
    }
 
function clusterImages(json)
    {
    console.log(`Clustering ${json.length} images....`);
    const histograms = json.map(({imageData}) => imageData.data)
                           .map(countHuePixels)
                           .map(toVector);
    // create mapping
    let mapping = histograms.reduce((accum, vector, index) => 
        {
        if (vector in accum)
            {
            accum[vector].push(index);
            }    
        else
            {
            accum[vector] = [index];    
            }
        return accum;
        } , {});
    // now split images into those with colors and black and white - so these can be analyzed separately
    let colorImageHistograms = [];
    let grayscaleImageHistograms = [];
    histograms.forEach(histogram => 
        {
        let colorPart = [...histogram];
        colorPart.length = 6;
        let colorImage = colorPart.some(value => value > 0);
        if (colorImage)
            {   
            colorImageHistograms.push(histogram);
            }
        else
            {
            grayscaleImageHistograms.push(histogram);
            }
        });
    // cluster the two parts
    let colorRes = sdbscan(colorImageHistograms, epsilon, minimalRegionSize);
    let grayscaleRes = sdbscan(grayscaleImageHistograms, 10, minimalRegionSize);
    let colorIndices = colorRes.clusters.map(({data:points}) => points.flatMap(point => mapping[point]));
    let grayscaleIndices = grayscaleRes.clusters.map(({data:points}) => points.flatMap(point => mapping[point]));
    // combine the two sets of clusters
    let imageClusterIndices = [...colorIndices, ...grayscaleIndices];
    return {imageClusterIndices, json, histograms, mapping};
    }   

const maxGroupSize = 5; // max members per group
function processClusters({imageClusterIndices, json, histograms, mapping})
    {
    return new Promise(resolve => 
        {
        console.log(`Procesing ${imageClusterIndices.length} clusters....`);
        // remove all imgages that are not part of any cluster
        let nonEmptyClusters = imageClusterIndices.filter(cluster => cluster.length > 1);
        // organize on report source so that each cluster has only one.
        let uniqueClusters = nonEmptyClusters.map(cluster => uniqueClusterMembers(cluster, histograms, json))
                                            .filter(cluster => cluster.length > 1);        // remove clusters that have shrunk after removing duplicates.
        // split too large cluster on aspect ratios
        let splitPromises = uniqueClusters.map(cluster => 
            {
            let newClusters = splitAspectRatio(cluster, json);   
            return validateAspectRatioSplits(newClusters, json);
    // validate each cluster with ssim.-- discard those that do not match
    // get representative value for each valid cluster - take first element
    // run ssim on each representative sample to see if clusters should be merged back

            });
        Promise.all(splitPromises)
            .then(splitClusters => 
                {
                let revisedClusters = splitClusters.flat();   // ensure it is an array of clusters (arrays)
                resolve({clusters:revisedClusters, json, histograms, mapping});
                });
        });
    }

function validateAspectRatioSplits(newClusters, json)
    {
    return new Promise(resolve => 
        {
        if (newClusters.length <= 1)
            {
            resolve(newClusters);    // ok - no changes done to the cluster   
            return; // prevent further execution
            }
        // if split - look at the different parts.
        let validatePromises = newClusters.filter((v,i) => i < newClusters.length - 1)
                                          .map((v, i) => ({a:newClusters[i][0],b:newClusters[i+1][0],i,j:i+1}))
                                          .map(({a,b,i,j}) => imageSimilarity(json[a], json[b], i ,j));
        Promise.all(validatePromises)
            .then(results => 
                {
                // recombine clusters with detailed similarity below threshold
                let mergedClusters = []; 
                results.forEach(({i,j,s}) => 
                    {
                    if (s < imageSimilarityThreshold)   // below threshold, keep the clusters
                        {
                        mergedClusters.push(newClusters[i]);
                        mergedClusters.push(newClusters[j]);
                        }
                    else    // above limit, probably same iomage, remerge the clusters
                        {
                        mergedClusters.push([...newClusters[i], ...newClusters[j]]);
                        }
                    });
                resolve(mergedClusters); // dummy                                         
                });
        })    
    }

// split up large groups using aspect ratios
function splitAspectRatio(cluster, json)
    {
    if (cluster.length <= maxGroupSize)
        {
        return [cluster]; // do nothing, it is an acceptable size, could be similar images with different aspect ratios
        }
    // retrieve aspect ratios
    let aspectRatios = cluster.map(index => 
        {
        let { aspectRatio } = json[index];
//        aspectRatio  = aspectRatio.toFixed(1);  // round down to two decimals for some fuzzyness.
        aspectRatio  = aspectRatio.toFixed(2);  // round down to two decimals for some fuzzyness.
        return ({index, aspectRatio});
        });
    // create aspect ratio histogram
    let histogram = Object.groupBy(aspectRatios, ({aspectRatio}) => aspectRatio);
    let newClusters = Object.keys(histogram) // traverse all the ratios
//            .map(ratio => ({ratio, cluster: histogram[ratio].map(({index}) => index)})); 
                            .map(ratio => histogram[ratio]) // get the list of images for the current aspect ratio 
                            .filter(cluster => cluster.length > 1) // only consider ratios with more than 1 images
                            .map(cluster => cluster.map(({index}) => index));   // just get the index
    return newClusters;
    }

// Second pass: check each detected cluster with more expensive similarity measure to validate that there are actual similarities
// the function return only similar images in a cluster and discards those that are too dissimilar.
const imageSimilarityThreshold = 0.7;    // minimmum similarty for images to be in a cluster
function keepValidClusters(results)
    {
    let {clusters, json} = results;
    console.log(`Second pass: Validating ${clusters.length} image clusters...(slow)`);
    return new Promise(resolve => 
        {
        // set up all comparisons and wait for promises to finish
        let comparisonPromises = clusters.map(cluster => clusterSimilarities(cluster, json));
        // then do the final tyding up
        Promise.all(comparisonPromises)
            .then(clustersSimilarities => 
                {
                // traverse each cluster
                let newClusters = clustersSimilarities.reduce((accumulator, clusterSimilarities, clusterIndex) => 
                    {
  ///                  let validImages = new Set();
                    let splitClusters = [];
                    clusterSimilarities
                        .filter(({s}) => s > imageSimilarityThreshold)
                        .forEach(({i,j}) => 
                            {
                            let Ci = splitClusters.find(set => set.has(i));
                            let Cj = splitClusters.find(set => set.has(i));
//console.log(Ci,Cj)                            
                            if (Ci != undefined)    // if one part of new cluster already checked
                                {
                                Ci.add(j);          // then, add new part to existing cluster
                                }
                            else if (Cj != undefined)   // ditto for the other part of new cluster.
                                {
                                Cj.add(j);          // then, add
                                }
                            else                    // of none of the indices in clusters, add new cluster with the two indicies.
                                {
                                splitClusters.push(new Set([i, j]));
                                }
//                            validImages.add(sourceCluster[i]);
  //                          validImages.add(sourceCluster[j]);
                            });

                        // convert and add the new clusters
                        let sourceCluster = clusters[clusterIndex];
                        // go from local cluster indices to json image indices
                        splitClusters = splitClusters.map(set => [...set]); // set to arrays
                        // add the new clusters to the reduce accumulator
                        splitClusters.forEach(matches =>
                            {
                            // convert from set index to json index
                            let cluster = matches.map(match => sourceCluster[match]);
//console.log(matches, cluster)                                
                            accumulator.push(cluster);
                            }); 

              //      let newCluster = [...validImages];
//if (/*splitClusters.length !=*/ clusterSimilarities.length > 2)
//    {
//      console.log(clusterSimilarities)  
//      console.log(splitClusters)  
//    }

//                    return newCluster;
                    return accumulator;
                    }, [])
                .filter(cluster => cluster.length > 0); // remove empty clusters where all elements are removed                    
                // signal it is all done
                results.clusters = newClusters;
                resolve(results);
                })
        });
    }

function clusterSimilarities(cluster, json)
    {
    return new Promise(resolve => 
        {
        let similarityPromises = [];
        cluster.forEach((a,i) => 
            {
            cluster.forEach((b,j) => 
                {
                if (i < j)
                    {
                    let first = json[a];
                    let second = json[b];
                    similarityPromises.push(imageSimilarity(first, second, i ,j));    
                    }
                })    
            });
        Promise.all(similarityPromises)
            .then(clusterSimilarities => resolve(clusterSimilarities));
        });
    }

function imageData2DataURL(imageData, pixels)
    {
    let canvas = document.createElement("canvas");
    canvas.height = imageData.width;
    canvas.width = imageData.height;
    let ctx = canvas.getContext("2d");
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();        
    }

function imageSimilarity(a, b, i ,j)
    {
    let aDataURL = imageData2DataURL(a.imageData);
    let bDataURL = imageData2DataURL(b.imageData);
    return new Promise(resolve =>   // marshall relevant info into promise
        {
        ssim(aDataURL, bDataURL)
            .then(out => resolve({i, j, s: out.mssim}));
        });    
    }

// This function helps remove duplicate images from the same document (source).
// It is based on finding the cluster mean color profile and picking the one most similar to the mean.
function uniqueClusterMembers(cluster, histograms, json)
    {
    let sources = cluster.map(index => json[index].name);
    let histogram = Object.groupBy(sources, (e) => e); 
    let uniqueSources = Object.keys(histogram);
    if (uniqueSources.length < 2)
        {
        return [];  // signal that it should be removed as cluster
        }
    // determine which duplicates to remove?
    // compute the mean profile vector
    let emptyVector = Array(histograms[0].length).fill(0);
    let meanVector = cluster
        .reduce((accumulator, index) => 
            {
            let colorHistogram = histograms[index];
            return accumulator.map((value, i) => value + colorHistogram[i]);
            }, emptyVector)
        .map(value => value/cluster.length);
    // for each uniqueSource - keep the one that is the closest to the mean.
    let finalCluster = {};
    cluster.forEach(index => 
        {
        let name = json[index].name;
        let colorHistogram = histograms[index];
        let difference = meanVector.reduce((accumulator, value, i) => 
            {
            return accumulator + (value - colorHistogram[i])**2;    
            }, 0) ** (1/2);
        let entry = {index, name, difference};
        if (name in finalCluster && difference > finalCluster[name].difference)
            {
            return; // break iteration
            }
        finalCluster[name] = entry;    
        });
    // we must remove duplicates of the same sources, perhaps split up? into clusters
    let finalClusterIndices = Object.keys(finalCluster).map(name => finalCluster[name].index);
    return finalClusterIndices;
    }
    

// convert a histogram vector into string that is sortable
function colorHistogramValue(colorHistogram)
    {
    const priorities = [5, 4 , 3,    2, 1, 0,   6, 7, 8];    // reodrering the priority based on "unuual hues first"
    const reordered = priorities.map(order => colorHistogram[order]);
    const rep = reordered.map(count => (""+Math.round(count)).padStart(4, '0'))
                         .join("-");    
//console.log(colorHistogram, rep)                                
    return rep;
    }
function subSort(arr, i, n, sortFx)
    {
    [].concat(...arr.slice(0, i), ...arr.slice(i, i + n).sort(sortFx), ...arr.slice(i + n, arr.length));    
    }



function countHuePixels(data) 
    {
    const colorCounts = 
        {
        red: 0, green: 0, blue: 0, yellow: 0, cyan: 0, magenta: 0, whiteish: 0, greyish: 0, blackish: 0
        };
        
    // helper
    function rgbToHsv(r, g, b) 
        {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, v = max;
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) 
            {
            h = 0; // achromatic
            } 
        else 
            {
            switch (max) 
                {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
                }
            h /= 6;
            }
        return [h * 360, s, v];
        }

    // Helper functions to check if a pixel is white-ish, grey-ish, or black-ish
    function isWhiteish(r, g, b) 
        {
        const threshold = 200;
        return r > threshold && g > threshold && b > threshold;
        }

    function isBlackish(r, g, b) 
        {
        const threshold = 55;
        return r < threshold && g < threshold && b < threshold;
        }

    // this one is incorrect
    function isGreyish(r, g, b) 
        {
        const minThreshold = 56;
        const maxThreshold = 199;
        const diff = Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);       // for it to be gray the components must be similar.
        return r >= minThreshold && r <= maxThreshold &&
                g >= minThreshold && g <= maxThreshold &&
                b >= minThreshold && b <= maxThreshold &&
                diff < 20;
        }

    // Loop through the pixel data
    for (let i = 0; i < data.length; i += 4) 
        {
        // Extract the RGBA values
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Determine if the pixel is white-ish, black-ish, or grey-ish first
        if (isWhiteish(r, g, b)) 
            {
            colorCounts.whiteish++;
            } 
        else if (isBlackish(r, g, b)) 
            {
            colorCounts.blackish++;
            } 
        else if (isGreyish(r, g, b)) 
            {
            colorCounts.greyish++;
            } 
        else 
            {
            // Convert RGB to HSV
            const [h, s, v] = rgbToHsv(r, g, b);
            // Determine the hue
            if (s > 0.2 && v > 0.2) 
                { // Ensure saturation and value are above a threshold to exclude grey-ish colors
                if (h >= 0 && h < 30 || h >= 330 && h < 360) 
                    {
                    colorCounts.red++;
                    } 
                else if (h >= 30 && h < 90) 
                    {
                    colorCounts.yellow++;
                    } 
                else if (h >= 90 && h < 150) 
                    {
                    colorCounts.green++;
                    } 
                else if (h >= 150 && h < 210) 
                    {
                    colorCounts.cyan++;
                    } 
                else if (h >= 210 && h < 270) 
                    {
                    colorCounts.blue++;
                    } 
                else if (h >= 270 && h < 330) 
                    {
                    colorCounts.magenta++;
                    }
                } 
            else 
                {
                colorCounts.greyish++;
                }
            }
        }
    return colorCounts;
    }
   

// version routines

function createHistograms(json)
    {
    const histograms = json.map(({imageData}) => imageData.data)
                           .map(countHuePixels)
                           .map(toVector);
    // create mapping
    let mapping = histograms.reduce((accum, vector, index) => 
        {
        if (vector in accum)
            {
            accum[vector].push(index);
            }    
        else
            {
            accum[vector] = [index];    
            }
        return accum;
        } , {});
    return {histograms, mapping};
    }   

// Sanitizing the local filename-strings
function filenameToName(filename)
    {
    return filename.toLowerCase()   // in case it is inspera
                   .split(" (")[0]
                   .replaceAll(" ","")
                   .split("_")[0] // in case it is canvas
                   .replaceAll("-","");
    }

// return links
function matchVersions(former, final)
    {
    console.log("about to analyze versions");
    console.log("Former set: ", former.length, ", final set: ", final.length);  
    console.log("Greedy matching...");
    // calc histogram - find closest matches
    let {mapping:formerMap} = createHistograms(former);
    let {histograms:finalHist} = createHistograms(final);
    // for each histogram in final images see if any exact matches in former set, using the mapping
    let matches = finalHist.map(final => formerMap[final]??[]);
    // show the matches found
    let possibleLinks = matches.map((contenders, finalIndex) => ({finalIndex, contenders}))
                               .filter(({contenders}) => contenders.length == 1)
                               .map(({contenders, finalIndex}) => ({finalName: final[finalIndex].name, formerName: former[contenders[0]].name, finalIndex, formerIndex: contenders[0]}));

    console.log(possibleLinks);

     let detailedCheckPromises = possibleLinks.map(possibleLink => 
        {
        return new Promise(resolve => 
            {
            let {formerIndex, finalIndex} = possibleLink;
            let a = former[formerIndex];
            let b = final[finalIndex];
            imageSimilarity(a, b, formerIndex , finalIndex)
                .then(({i,j,s}) => resolve({...possibleLink, s}));
            });
        })

    // filter unique and select the ones with the highest count
    let linkHistogram = Object.groupBy(possibleLinks, (({finalName, formerName}) => finalName + " --- " + formerName));
    // remember that there are more images than people...resolve ties based on counts
    let linkStrings = Object.keys(linkHistogram);
    linkStrings.sort((a,b) => linkHistogram[b].length - linkHistogram[a].length);
    // debugging
//    linkStrings.forEach(link => console.log(link, linkHistogram[link].length));
    // traverse and build up final links
    let formerLinked = new Set();
    let finalLinked = new Set();
    let finalLinks = []; 
    linkStrings.forEach(link => 
        {
//console.log(linkHistogram[link]);
//throw "stop"            
        let {finalName, formerName} = linkHistogram[link][0]; // first element   
        if (formerLinked.has(formerName))
            {
            return;
            }
        if (finalLinked.has(finalName))
            {
            return;
            }
        finalLinks.push({finalName, formerName});
        formerLinked.add(formerName);
        finalLinked.add(finalName);
        });

    // start statistics   

    //console.log("final mappings", finalLinks);

    let misMatches = finalLinks.filter(({finalName, formerName}) => filenameToName(finalName) != filenameToName(formerName));
////    let misMatches = finalLinks.filter(({finalName, formerName}) => finalName != formerName);
    let falsePositives = misMatches.length; 
    let truePositives = finalLinks.length - falsePositives;

    let allFinalNames = new Set(final.map(({name}) => name).map(filenameToName));
    let allFormerNames = new Set(former.map(({name}) => name).map(filenameToName));
    let finalReportsWithImages = allFinalNames.size;
    let formerReportsWithImages = allFormerNames.size;
//   let falseNegatives = allFinalNames.difference(finalLinked).size;
//   let trueNegatives = allFormerNames.difference(allFinalNames).size;
    let commonReportsFinalFormer = allFinalNames.intersection(allFormerNames).size;

    // true mathematical definitions
//    let precision = truePositives / (truePositives + falsePositives); 
//    let recall = truePositives / (truePositives + falseNegatives);
//    let accuracy = (truePositives + trueNegatives) / (truePositives + trueNegatives + falsePositives + falseNegatives);
//    let F = 2 * precision * recall / (precision + recall);

    // redefined based on relevance, recall: not possible to map something in former that is not there.
    let precision = truePositives / finalLinks.length
    let recall = truePositives / commonReportsFinalFormer;
    let F = 2 * precision * recall / (precision + recall);

    console.log({truePositives, falsePositives, precision, recall, F, finalReportsWithImages, formerReportsWithImages, commonReportsFinalFormer  });
    console.log("mismatches", misMatches)
    saveSheet("versionStats.xlsx",[{truePositives, falsePositives, precision, recall, F, finalReportsWithImages, formerReportsWithImages, commonReportsFinalFormer, misMatches }]);

    // histogram - number of images in the reports
    let allImages = final.map(({name}) => name);
    let allHistogram = Object.groupBy(allImages, (e => e));
    let noFigures = Object.keys(allHistogram).map(key => allHistogram[key].length);
    let noFiguresHistogram = Object.groupBy(noFigures, (e => e));
    noFigures = Object.keys(noFiguresHistogram);
    noFigures.sort((a,b) => a - b);
    noFigures.forEach(noFig => console.log(noFig, noFiguresHistogram[noFig].length)); 

    // end statistics

    return {finalLinks, possibleLinks};
    }

//let processed = 0;
//const chunkSize = 10;


// promies fire off in parallel, see follwing explantatiopn
// https://stackoverflow.com/questions/24586110/resolve-promises-one-after-another-i-e-in-sequence

/*
 * serial executes Promises sequentially.
 * @param {funcs} An array of funcs that return promises.
 * @example
 * const urls = ['/url1', '/url2', '/url3']
 * serial(urls.map(url => () => $.ajax(url)))
 *     .then(console.log.bind(console))
 */
const serial = funcs =>
    funcs.reduce((promise, func) =>
        promise.then(result => func().then(Array.prototype.concat.bind(result))), Promise.resolve([]))
/*
// first take your work
const urls = ['/url1', '/url2', '/url3', '/url4']

// next convert each item to a function that returns a promise
const funcs = urls.map(url => () => $.ajax(url))

// execute them serially
serial(funcs)
    .then(console.log.bind(console))*/

//const funcs = json.map(({imageURL},index) => () => loadImage(imageURL).then(img => model.classify(img)));
//serial(funcs)
//    .then(console.log.bind(console))

function loadImage(imageURL)
    {
    return new Promise((resolve) => 
        {
        let image = new Image();
        image.onload = function () 
            {
            resolve(image);
            }
        image.src = imageURL;   
        });
    }























// By Frode Eika Sandne, February, 2025.

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
       
        // keep info about the source for reference
        let {lastModifiedDate, name, size} = file;
        let sourceInfo = {name, lastModifiedDate, size};
        
        reader.onload = (function(theFile) 
            {
            return function(e) 
                {  
                document.getElementById("startForm").style.display = "none";
                document.getElementById("processing").style.display = "block";
                // read file into json og parse
                let json = JSON.parse(e.target.result);

                // break-in inspection
                // visualSummary(json);
                // viewImages(json);
                // throw "Stopped";

                unifiedDownSampling(json)
                    .then(json => firstClusteringPass(json))
                    .then(results => keepValidClusters(results))
                    .then(({clusters, histograms, json, fuzzyClusters}) => 
                        {
                        let borrowedImages = findBorrowedImages(clusters);
                        console.log(`Found ${clusters.length} clusters with ${clusters.flat().length} images!`);
                        viewClusters(clusters, json, histograms);
                        outputBorrowedImages(borrowedImages, json);
// for hci 1 -- showing fuzzy clusters
//let h1 = document.createElement("h1");
//h1.innerText = "Fuzzy clusters";
//document.body.appendChild(h1);
//viewClusters(fuzzyClusters.filter(cluster => cluster.length > 1).map(cluster => {cluster.length = 10; return cluster}), json, histograms);    // only include clusters with more than one, truncate clusters larger than 10, to 10 elements.

// test the things that should be similar - the norman cycle for proj3 2024
//viewClusters([[130, 572, 647, 858, 873, 1134]], json, histograms);
//clusterSimilarities([130, 572, 647, 858, 873, 1134], json)
//    .then(sims => console.log(sims));

// get ratio-data for report
//spreadInAspectRatio(clusters, json);

                        let {studentGroups, individualStudents} = findStudentGroups(clusters, json); 

// for paper
//figureCountsGroupVsIndividual(studentGroups, individualStudents, json);

                        // save the results, not including the json due to the large space requirements
                        outputJson({studentGroups, individualStudents, imageClusterIndices:clusters,  borrowedImages, fuzzyClusters, sourceInfo}, "imageSimilarities");
                        // update GUI
                        document.getElementById("finished").style.display = "block";
                        document.getElementById("processing").style.display = "none";                         
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
    
// For overview of student story.
// --- should students be classified according to some criteria?
function visualSummary(json)
    {
    let figureNo = 1;   // pretty counter
    let previousName = "";
    let studentCounter = 0;
    json.forEach(entry => 
        {
        let image = new Image();
        image.src = entry.imageURL;
        image.onload = () => 
            {
            image.style.margin = "2px";
            if (entry.name != previousName)
                {
                previousName = entry.name;
                studentCounter++;
                let heading = document.createElement("h1");
                heading.innerText = "#"+studentCounter+": "+entry.name;  
                document.body.appendChild(heading); 
                }    
            document.body.appendChild(image);
            // add simple explanation
//            let caption = document.createElement("p");
//            caption.innerText = "Figure "+ (figureNo++) + ": Page "+entry.page + " of " + entry.name;
//            document.body.appendChild(caption);
            }
        });    
    }

function viewSelectedImage(selection,json)
    {
    let figureNo = 1;   // pretty counter
    selection.forEach(imageIdx => 
        {
        let entry = json[imageIdx];
        let image = new Image();
        image.src = entry.imageURL;
        image.onload = () => 
            {
            document.body.appendChild(image);
            // add simple explanation
            let caption = document.createElement("p");
            caption.innerText = "Figure "+ (figureNo++) + ": Page "+entry.page + " of " + entry.name + " width:"+ entry.imageWidth + ", height:"+entry.imageHeight;
            document.body.appendChild(caption);
            }
        });    
    }

// for debugging    
function viewImages(json)
    {
    let figureNo = 1;   // pretty counter
    json.forEach(entry => 
        {
        let image = new Image();
        image.src = entry.imageURL;
        image.onload = () => 
            {
            document.body.appendChild(image);
            // add simple explanation
            let caption = document.createElement("p");
            caption.innerText = "Figure "+ (figureNo++) + ": Page "+entry.page + " of " + entry.name;
            document.body.appendChild(caption);
            }
        });    
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
// for viewing all the groups
function viewClusters(imageClusterIndices, json, histograms)
    {
    // fix presentation order
    // next largest first - draw attention to the largest
    imageClusterIndices.sort((a, b) => b.length - a.length);
    // sort on color histogram - but avoid the large ones at the beginning.
    let start = imageClusterIndices.findIndex(cluster => cluster.length <= maxGroupSize);
    let end = imageClusterIndices.length;
//    subSort(imageClusterIndices, start, end, (a, b) => colorString(histograms[a[0]]) < colorString(histograms[b[0]]));
    subSort(imageClusterIndices, start, end, (a, b) => colorHistogramValue(histograms[a[0]]) < colorHistogramValue(histograms[b[0]]));

    // do the visualization 
    imageClusterIndices.forEach((imageCluster,j) => 
        {
        viewCluster(imageCluster, j, json, histograms);
        });
    }
// Viewing image cluster
function viewCluster(imageClusterIndices, clusterNo, json, histograms)
    {
    Promise.all(imageClusterIndices.map((imageIndex,imageNo) => new Promise(resolve => 
        {
        let {imageURL} = json[imageIndex];
        let image = new Image();
        image.src = imageURL;
        image.onload = () => 
            {
            resolve({image, imageNo, imageIndex});
            }      
        })))
    .then(results => // when all images are loaded insert stuff on the page
        {   
        // insert cluster heading 
        let heading = document.createElement("h1");
        heading.innerText = "Cluster: " + clusterNo;
        document.body.appendChild(heading);                
        // insert images
        results.map(({image, imageNo}) => 
            {
            document.body.appendChild(image);     
            let caption = document.createElement("span");
            caption.innerText = "(" + imageNo + ")";
            document.body.appendChild(caption);                       
            });
        // insert captions in list at the bottom for simpler interpretation.
        results.map(({imageNo, imageIndex}) => 
            {
            let {name, page, aspectRatio} = json[imageIndex];
            let caption = document.createElement("p");
            caption.innerText = `(${imageNo}/${imageIndex}): ${histograms[imageIndex]} ${name} (page ${page}), aspect: ${aspectRatio}`; 
            document.body.appendChild(caption);                          
            });
        }); 
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
   
    
// similarity experiments
console.log("Starting");

// need to run as live server for this to work. Later make fileloader.
// load all
const testNames = [
// project 1 versions
//    './hci1-former-images.json',
//  './hci1-final-images.json'
// project 2 versions
//    './hci2-former-images.json',
//    './hci2-final-images.json'
// project 3 versions
    './hci3-former-images.json',
    './hci3-final-images.json'
    ];

// experiment testing version matching
/*Promise.all(testNames.map(test => fetch(test)))
    .then(responses => Promise.all(responses.map(response => response.json())))
    .then(jsons => {
        let downSamplingPromises = jsons.map(json => unifiedDownSampling(json));
        return Promise.all(downSamplingPromises);
        })
    .then(images => matchVersions(...images));
*/
    1
// experiment testing group identification
// Project 2 groups
const imageFile = './hci2-final-images.json';
const metaFile = './hci2-2024-final-meta.json';
// Project 3 groups
//const imageFile = './hci3-final-images.json';
//const metaFile = './hci3-2024-final-meta.json';

/*
fetch(imageFile)
    .then(response => response.json())
    .then(json => unifiedDownSampling(json))
    .then(json => firstClusteringPass(json))
    .then(results => keepValidClusters(results))
    .then(({clusters, json}) => 
            {
            console.log(`Found ${clusters.length} clusters with ${clusters.flat().length} images!`);
            let {studentGroups, individualStudents} = findStudentGroups(clusters, json);
            // calc stats according to ground-truth
            fetch(metaFile)
                .then(response => response.json())
                .then(meta => 
                    {
                    let {mapping:groundTruth, groups:actualGroups, groupsList} = findGroupGroundTruth(meta.finalTexts);       
//                    console.log(groundTruth);
  //                  console.log(studentGroups)
                    // lookup either student numberf for the groups detected or lookup indexex of ground truth
                    // compute matching stats
                    // traverse detected groups
                    let measures = [];
                    studentGroups.forEach(estimated => 
                        {
                        // find matching group
                        // match each student to reference until we find a match.
                        let representative = estimated.find(member => member in groundTruth)
                        let truth = groundTruth[representative] ?? [];
                        let observation = performanceMeasures(estimated, truth);
                        measures.push(observation);
                        });
                    // output
                    let output = {
                        detectedGroups:studentGroups.length,
                        actualGroups:actualGroups.size,
                        individualStudents:individualStudents.length,
                        success: mean(measures, "success"),
                        similarity: mean(measures, "similarity"),
                        precision: mean(measures, "precision"),
                        recall: mean(measures, "recall"),
                        F: mean(measures, "F")
                        };
                    console.log(output);   
                    saveSheet(imageFile.substring(2, 18) +".xlsx", [output]);
                    // find potential image borrowing.
                    let borrowedCases = findBorrowedCasesBarebone(clusters, json, groupsList);
                    });
            })
*/


// find potentially borrowed images - by looking at cases with mismatches between images and text 
function findBorrowedCasesBarebone(clusters, json, actualGroups)
    {
    // different approach: use the ground-truths as the basis.
    // set up a cluster mapping based on name;
    let avoidSet = new Set(clusters.filter(cluster => cluster.length > maxGroupSize)
                            .flat());

    let clusterMapping = clusters.reduce((accumulator, cluster) => 
        {
        cluster.forEach(index => 
            {
            let name = json[index].name;
            accumulator[name] = cluster;
            });
        return accumulator;
        },{});
    // Step 0: traverse all ground truth groups
    let anomalies = actualGroups.reduce((accumulator , actualGroup) => 
        {
        // Step 1: for each actual group find affiliated images clusters
        let affiliatedClusters = actualGroup.flatMap(actualMember => clusterMapping[actualMember])
                                            .filter(imageIndex => !avoidSet.has(imageIndex));
        affiliatedClusters = [...new Set(affiliatedClusters)];

        // Step 2: find the owner of the images in the affiliated image clusters 
        let imageOwners = affiliatedClusters.flat()
                                    .filter(index => index != undefined)
                                    .map(index => json[index].name);
        // Step 3: find all image owners that are not in the actual group - and flag as anomaly.
        let actualSet = new Set(actualGroup);
        let ownerSet = new Set(imageOwners);
        let anomaly = ownerSet.difference(actualSet);
        if (anomaly.size > 0)
            {
            // find anomolous images
            anomaly = [...anomaly];
            let candidateImages = anomaly.map(name => clusterMapping[name]);
            let problemImages = candidateImages.map(candidates => 
                {
                let candidateSet = new Set(candidates)
                let affiliatedClusterSet = new Set(affiliatedClusters.flat());
                return candidateSet.intersection(affiliatedClusterSet);
                })
                .filter(set => set.size > 0); // remove non-matches
            
            // who lend images to borrowers
            let problemNames = problemImages.map(indices => [...indices].map(index => json[index].name));
            let lenders = problemNames.map((names, index) => 
                {
                let lender = anomaly[index];
                let nameSet = new Set(names)
                nameSet.delete(lender);
                return [...nameSet];
                })
                .filter(nameList => nameList.length > 0);

            if (lenders.length > 0)
                {
                // avoid duplicates
                let key = [...problemImages[0]].map(v => ""+v).join("-");
                accumulator[key] = {borrowers: anomaly, lenders, actualSet, affiliatedClusters, problemImages};
                }    
            }
        return accumulator;
        }, {}); 

    anomalies = Object.keys(anomalies).map(anomaly => anomalies[anomaly]);
    console.log(anomalies);           
    return anomalies;
    }

// stats routines for group testing
function mean(list, attribute)
    {
    return list.reduce((accumulator, {[attribute]:element}) => accumulator + element, 0) / list.length;
    }

function findGroupGroundTruth(texts)
    {
    // make set of actual submissions
    let groups = new Set();
    let groupsList = [];
    let mapping = texts.reduce((accumulator,{groupStudentNumbers, filename}) => 
        {
        let members = groupStudentNumbers.map(studNo => texts.findIndex(({studentNumber}) => studNo == studentNumber))
                                         .filter(index => index != -1); // only include those found
        members = members.map(member => texts[member].filename);
        members.sort();
        if (members.length > 1)
            {
            groups.add(members.join(", "));
            groupsList.push(members);
            }
        members.forEach(filename => 
            {
            accumulator[filename] = members;    // map all    
            })
        return accumulator;
//        return ({...accumulator, [filename]:members});
        },{});
    return {mapping, groups, groupsList};
    }

function performanceMeasures(estimated, groundTruth)
    {
    let estimate = new Set(estimated);
    let truth = new Set(groundTruth);
    let truePositives = estimate.intersection(truth);
    let falsePositives = estimate.difference(truth);
    let allRetrieved = estimate.union(truth); 
    let similarity = truePositives.size / allRetrieved.size; // same as precision
    let precision = truePositives.size / (truePositives.size + falsePositives.size);
    let recall = truePositives.size / truth.size;
    let F = ((precision + recall) > 0) 
        ? 2 * (precision * recall) / (precision + recall)
        : 0;
    let success = similarity < 1 ? 0: 1;
    return {success, similarity, precision, recall, F};
    }    

// verion routines


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

    // no effect - seems like mismatches could be valid from same group---check
  /*  console.log("Validating possible links...");
    Promise.all(detailedCheckPromises)
        .then(results => 
            {
            let possibleLinksFiltered = results.filter(({s}) => s > imageSimilarityThreshold);
            let skipped = results.filter(({s}) => s < imageSimilarityThreshold);
            console.log(possibleLinks, possibleLinksFiltered);
            console.log(skipped);
            
            // filter unique and select the ones with the highest count
            let linkHistogram = Object.groupBy(possibleLinksFiltered, (({finalName, formerName}) => finalName + " --- " + formerName));
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

            // histogram - number of images in the reports
            let allImages = final.map(({name}) => name);
            let allHistogram = Object.groupBy(allImages, (e => e));
            let noFigures = Object.keys(allHistogram).map(key => allHistogram[key].length);
            let noFiguresHistogram = Object.groupBy(noFigures, (e => e));
            noFigures = Object.keys(noFiguresHistogram);
            noFigures.sort((a,b) => a - b);
            noFigures.forEach(noFig => console.log(noFig, noFiguresHistogram[noFig].length)); 

            // end statistics

            return finalLinks;
            });
console.log("afterwards");
throw "stop"    
*/

 ////                              .map(({finalName, formerName}) => ({finalName: filenameToName(finalName), formerName: filenameToName(formerName)}));
 //   let possibleLinkStrings = possibleLinks.map(({finalName, formerName}) => finalName + " --- " + formerName);
    // for debugging and inspection
/*    possibleLinks.forEach(({finalName, formerName}) => 
        {
//        let finalName = final[finalIndex].name.split(" (")[0].toLowerCase().replaceAll(" ","");  // inspera
//        let formerName = former[contenders[0]].name.split("_")[0]; // canvas
        console.log(finalName, " --- ", formerName);    
        });*/


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



// Testing AI deep image recognition on images with tensor flow

//const AIFile = './hci1-final-images.json';
//const AIFile = './hci2-final-images.json';
//const AIFile = './hci3-final-images.json';
const AIFile = './gruppeImages.json';

const serial = funcs =>
    funcs.reduce((promise, func) =>
        promise.then(result => func().then(Array.prototype.concat.bind(result))), Promise.resolve([]))

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

function interpretImage(imageURL, model, index)
    {
    console.log("starting... ",index)
    return loadImage(imageURL)
        .then(img => 
            {
            console.log("...ending ",index)
            return model.classify(img);
            });
    }

// this one uses reduce - difficult, backwards compatible

/*mobilenet.load()
    .then(model => // model now in local scope
        {
        fetch(AIFile)
            .then(response => response.json())
            .then(json => // images now also in local scope 
                {
//                const funcs = json.map(({imageURL},index) => () => loadImage(imageURL).then(img => model.classify(img)));
                const funcs = json.map(({imageURL},index) => () => interpretImage(imageURL, model, index));
                serial(funcs)
                    .then(results => 
                        {   
console.log("Reached the end...")
                        let itemsFound = results.filter(({probability}) => probability > 0.7)
                                                .map(({className}) => className);
                        let histogram = Object.groupBy(itemsFound, (e => e));
                        let keys = Object.keys(histogram);
                        keys.sort((a,b) => histogram[b].length - histogram[a].length);
                        keys.forEach((key,i) => console.log((i+1) + ": (" + histogram[key].length + " instances) -- "+key));
                        });                 
                })
            });
*/

// this one uses await on the promie of each loop iteration using a regular for loop, simpler structure

/*
let itemsFound = [];
mobilenet.load()
    .then(async model => // model now in local scope
        {
        fetch(AIFile)
            .then(response => response.json())
            .then(async json => // images now also in local scope 
                {
                return new Promise(async mainResolve => 
                    {     
                    await new Promise(async loopResolve => 
                        {                    
                        // Traverse all images
                        let index = 0;
                        console.log("About to apply tensorflow mobilenet to images....");
                        for (let image of json)
                            {
                            index++;
                            let {imageURL} = image;
                            console.log(index+"...");
                            let predictions = await interpretImage(imageURL, model, index);

                            console.log("..."+index);                        
                            let {className, probability} = predictions[0];
        //console.log(className, probability)                               
                            if (probability > 0.7)
                                {
                                itemsFound.push(""+className);
                                }
    
                            if (index >= json.length)
                                {
                                console.log("resolved all")
                                mainResolve();
                                }
                            loopResolve();
                            };
                        });
                    });               
                })
            .then(() => 
                    {   
console.log("Reached the end...")
                let histogram = Object.groupBy(itemsFound, (e => e));
                let keys = Object.keys(histogram);
                keys.sort((a,b) => histogram[b].length - histogram[a].length);
                keys.forEach((key,i) => console.log((i+1) + ": (" + histogram[key].length + " instances) -- "+key));
                })
            });
*/



// Get image information for the paper.
//const filename = './hci1-final-images.json';
//const filename = './hci2-final-images.json';
//const filename = './hci3-final-images.json';
//const filename = './hci1-former-images.json';
//const filename = './hci2-former-images.json';
//const filename = './hci3-former-images.json';

/*fetch(filename)
    .then(response => response.json())
    .then(json => 
        {
        let stats = imageStatistics(json, filename);
        console.log(stats);
//        console.log(JSON.stringify(stats, 2));
////        saveSheet(filename.substring(2, 18) +".xlsx", stats.figFrequencies);
        });*/

/*
const testNames = [
        './hci1-2023-processed.json',
        './hci2-2023-processed.json',
        './hci3-2023-processed.json',
        './MMI-proj1-2024-final.json',
        './MMI-proj2-2024-final.json',
        './MMI-proj3-2024-final.json'
        ];

 Promise.all(testNames.map(test => fetch(test)))
        .then(responses => Promise.all(responses.map(response => response.json())))
        .then(responses => experiment(responses));
*/

function imageStatistics(json, filename)
    {
    // basic stats
    let noImages = json.length;
    let allNameList = json.map(({name}) => name);
    // histograms of names gives no of figures
    let histogram = Object.groupBy(allNameList, (e => e));
    let names = Object.keys(histogram);
    let noStudents = names.length;
    // histogram of no of figures.
    let figCountsHist = Object.groupBy(names, (name => histogram[name].length));
    let counts = Object.keys(figCountsHist);
    counts.sort((a,b) => a - b);
//    counts.sort((a,b) => figCountsHist[a].length - figCountsHist[b].length);
    let figFrequencies = counts.map(count => ({noFigs:count,freq:figCountsHist[count].length}))

    // stuff for -test - one at a time, then combine
    let label = filename.substring(2,filename.length - 5);
    let tTest = names.map(name => ({label,count:histogram[name].length})); 
saveSheet("tTest-"+ label +".xlsx",tTest);

    return {noStudents, noImages, figFrequencies};
    }

// for å sammenlikne gruppe vs ikke gruppe
function figureCountsGroupVsIndividual(studentGroups, individualStudents, json)
    {
console.log(studentGroups, individualStudents)
    let groupStudents = studentGroups.flat();
    let groupFigCount = groupStudents.map(studentName => json.filter(({name}) => name == studentName).length);
    let soloFigCount = individualStudents.map(studentName => json.filter(({name}) => name == studentName).length);
    let groupTable = getFreqTable(groupFigCount);
    let soloTable = getFreqTable(soloFigCount);
    saveSheet("group-fig-freq.xlsx",groupTable);
    saveSheet("solo-fig-freq.xlsx",soloTable);
    let tTest = [...groupFigCount.map(count => ({type:"group",count})), 
                 ...soloFigCount.map(count => ({type:"solo",count}))];
    saveSheet("tTest-solo-group-.xlsx",tTest);
    }

function getFreqTable(listCounts)
    {
    let countHistogram = Object.groupBy(listCounts, (e => e));
    let table = Object.keys(countHistogram)
                      .toSorted((a, b) => a - b)
                      .map(key => ({key, value: countHistogram[key].length}));
    return table;
    }

function saveSheet(filename, sheet)
    {
	var ws = XLSX.utils.json_to_sheet(sheet);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, filename);
    XLSX.writeFile(wb, filename);
    }

// for stats - variation in aspect ratio.
function spreadInAspectRatio(clusters, json)
    {
//console.log(clusters, json)
    // traverse each cluster
    let differences = clusters.map(cluster => 
        {
        // compute difference for cluster
//console.log(cluster.map(imageIndex => json[imageIndex]));     
        let ratios = cluster.map(imageIndex => json[imageIndex].aspectRatio);
        let min = Math.min(...ratios);
        let max = Math.max(...ratios);
//console.log(ratios, min, max)
        return max - min;    
        })
                .map(ratio => ratio.toFixed(1));    // round to one digit for explicit bins
    let histogram = Object.groupBy(differences, (e => e));
    let range = Object.keys(histogram);
    range.sort((a,b) => a - b);
    let freqTable = range.map(diff => ({diff, freq:histogram[diff].length}));
    saveSheet("aspectAratios.xlsx",freqTable);
throw "...got what we came to find!";  
    }



// imagelookup - input index of one image -json all images - return list of all images meeting the requirement
function imageLookup(index, json)
    {
    return new Promise(resolve => 
        {
//        let exemplar = json[index].imageData;
//        let promises = json.map(({imageData},j) => imageSimilarity(exemplar,imageData, index, j)); 
        let exemplar = json[index];
        let promises = json.map((imageData,j) => imageSimilarity(exemplar, imageData, index, j)); 
        Promise.all(promises)
            .then(sims => 
                {
                let result = sims.filter(({s}) => s > imageSimilarityThreshold);
                result.sort((a,b) => b.s - a.s);
                resolve(result);
                });
        });
    }

// Abandoned - accurate matching
/* From main routine

  console.log("Accurate matching...");
//    let matchPromises = matches.filter(contenders => contenders.length > 1)
//                                .map((contenders, finalIndex) => findBestMatch(final[finalIndex], contenders, former));
    let matchPromises = matches.map((contenders, finalIndex) => (contenders.length > 1)
                                    ? findBestMatch(final[finalIndex], contenders, former)
                                    : ((contenders.length == 1) 
                                        ? contenders[0]
                                        : -1)    // no match
                                    );
    Promise.all(matchPromises)
        .then(bestMatches => 
            {
            console.log("all bestmatch promises are resolved",bestMatches)    
            });

function findBestMatch(exemplar, contenders, source)
    {
    return new Promise(resolve => 
        {
        let similarityPromises = contenders.map((contender, index) => 
            {
console.log(index, exemplar.name, source[contender].name)                          
//console.log(index, exemplar, source[contender])                
            return imageSimilarity(exemplar, source[contender], 0 , 0);
            });
        Promise.all(similarityPromises)
            .then(results => 
                {
//console.log(results)                    
                let similarities = results.map(({s}) => s);
                let max = Math.max(...similarities);
              //  let maxIdx = similarities.indexOf(max);
                let maxIdx = max > imageSimilarityThreshold 
                                        ? similarities.indexOf(max)
                                        : -1;   // no match.
    console.log(max,  maxIdx, "resolving image sim ", similarities);
    //console.log("the set ",contenders, contenders[maxIdx])
                resolve(contenders[maxIdx]);
                });            
        });    
    }

// document checks that were abandoned

//const hashCode = s => s.split('').reduce((a,b) => (((a << 5) - a) + b.charCodeAt(0))|0, 0);
function hashCode(str)
    {
    return str.substr(25, 45);
    }
// proper one


async function sha256(rawData) 
    {
    const data = typeof rawData === 'object' ? JSON.stringify(rawData) : String(rawData);

    const msgBuffer = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }


// not robust- identical images on the same page trips it up.... må tenke litt.
function checkDataset(images)
    {
    return new Promise(resolve => 
        {
    //    let hashes = images.map(({imageURL}) => sha256(imageURL));
        let hashes = images.map(image => sha256(image));
        Promise.all(hashes)
            .then(hashes => 
                {
//                console.log(hashes);    
                let histogram = Object.groupBy(hashes, (hash => hash));
                let anomalies = hashes.filter(hash => histogram[hash].length > 1);
//                console.log("Anomalies in image data:" + anomalies.length)
//        console.log(histogram);    
//        console.log(anomalies.map(hash => histogram[hash]));
                if (anomalies.length > 1)
                    {
                    let names = anomalies.map(hash => hashes.indexOf(hash))
                                        .map(index => images[index].name);
            
                    throw "Seemingly duplicate records for "+names.join(",")+".";
                    }
                resolve(images)
                }
            );
        });
    }

function checkDatasets(imageSet)
    {
    let checkPromises = imageSet.map(images => checkDataset(images));
    return Promise.all(checkPromises);    
    }


*/


/*const datasets = [
      './hci1-former-images.json',
      './hci1-final-images.json',
      './hci2-former-images.json',
      './hci2-final-images.json',
      './hci3-former-images.json',
      './hci3-final-images.json'
        ];

Promise.all(datasets.map(test => fetch(test)))
    .then(responses => Promise.all(responses.map(response => response.json())))
    .then(jsons => {
        finalFormerPaired(jsons, datasets);
        });
*/
// used paired analysis across projects for two way RM anova
function finalFormerPaired(jsons, datasets)
    {
    // setup stuff
    let labels = datasets.map(filename => filename.substring(2,filename.length - 5));
    // find name present inn all categoires
    let names = jsons.map(json => json.map(({name}) => filenameToName(name)));
    // create sets
    let nameSets = names.map(list => new Set(list));
console.log(nameSets);    
    // find the interection of all these sets
    let completeSet = nameSets.reduce((accumulator, set) => accumulator.intersection(set), nameSets[0]);  
    let completeList = [...completeSet];
console.log(completeList);
    // calculate the number of figures for each person for each project type
    let counts = completeList.map(student => jsons.map(json => json.filter(({name}) => filenameToName(name) == student).length));
console.log(counts);
    // prepare json for spreaksheet
    let data = counts.map((counts,studIndex) => counts.reduce((accumulator, count, setIndex) => 
        {
        let name = completeList[studIndex];
        let paramName = datasets[setIndex];
        accumulator = {...accumulator, name, [paramName]:count};    
        return accumulator;
        },{}));
console.log(data);
    saveSheet("RM-anova.xlsx",data);
    }




// IDEA: group visualizations overview
// read inn images and clusters

//const imageSrc = './hci2-final-images.json';
//const clusterSrc = './hc2-final-imageCluster.json';
const imageSrc = './hci3-final-images.json';
const clusterSrc = './hci3-final-imageCluster.json';
let images = [];
let clusters = [];

console.log("starting visualization");
fetch(imageSrc)
    .then(response => response.json())
 //   .then(json => unifiedDownSampling(json))    // needed if doing the last comparison step
    .then(response => 
            {
            images = response;    
            return fetch(clusterSrc);
            })
    .then(response => response.json())            
    .then(response => 
        {
        clusters = response;
        groupsVisualization(clusters, images);

// output collab data
console.log(collabData);  
//outputJson(collabData, "collaborationData");
saveSheet("collaborationData.xlsx", collabData);
        });

// for each cluster make visualization
function groupsVisualization(clusters, images)
    {
    // label each image with index for easy reference
    images = images.map((image, index) => ({...image, index}));
    // create convenient lookup structure
    let clusterLookup = clusters.imageClusterIndices.reduce((accumulator, cluster) => 
        {
        cluster.forEach(index => accumulator[index] = cluster);
        return accumulator;
        }, {});
    // view each group
    clusters.studentGroups.forEach((groupMembers, groupNo) => groupVisualization(groupMembers, groupNo, /*clusters,*/ images, clusterLookup));        
    }

// get the shared and solo image info about group member - returned in array on corresponding to group members
function getGroupImageInfo(groupMembers, images, clusterLookup)
    {
    // find images of each group members
    let memberImages = groupMembers.map(member => images.filter(({name}) => name == member)
                                                        .map(({index}) => index));
    // sort images into individual and shared
    let memberShared = groupMembers.map((member, memberNo) => 
                            memberImages[memberNo].reduce((accumulator, imageIndex) => 
            {
            if (imageIndex in clusterLookup)
                {
                accumulator.push(imageIndex);
                }
            return accumulator;
            }, [])
        );
    let memberSolo = groupMembers.map((member, memberNo) => 
        memberImages[memberNo].reduce((accumulator, imageIndex) => 
            {
            if (!(imageIndex in clusterLookup))
                {
                accumulator.push(imageIndex);
                }
            return accumulator;
            }, [])
        );
    return {memberShared, memberSolo, memberImages};
    }

function computeCollaborationStrengths({memberShared, memberSolo, memberImages})
    {
    let allSet = new Set(memberImages.flat());
    return memberSolo.map((solo, index) => 
        {
        // sets were not necessary here since no set operations were needed - could simply used array sizes - small overhead though - leave since we may use set operations later
        let soloSet = new Set(solo);
        let sharedSet = new Set(memberShared[index]);
//        let allSet = new Set(memberImages[index])
        return ({individuality: (soloSet.size/allSet.size).toFixed(2), collaboration: (sharedSet.size/allSet.size).toFixed(2)});
        });
    }

// experiment - check if solo images of group members are similar using detailed similarity measure
/*function doubleCheckGroup({memberSolo, images})
    {
    return new Promise(resolve => 
        {
        let comparePromises = [];
        memberSolo.forEach((soloList1,member1) => 
            {
            memberSolo.forEach((soloList2,member2) => 
                {
                if (member1 < member2)
                    {
                    soloList1.forEach(index1 => 
                        {
                        soloList2.forEach(index2 => 
                            {
                            let a = images[index1];
                            let b = images[index2];
      //      console.log(index1, index2, a, b)                    
                            comparePromises.push(imageSimilarity(a, b, index1, index2));
                            })    
                        });


                    }
                });
            });
        Promise.all(comparePromises)
            .then(results => 
                {
                resolve(results.filter(({s})=> s > imageSimilarityThreshold));;
                });
        }); 
    }
*/

// each visualization
function groupVisualization(groupMembers, groupNo, /*clusters,*/ images, clusterLookup)
    {
    // avoid trouble
    if (groupMembers.size < 1 || groupMembers.size > maxGroupSize)
        {
        return; // early exit if unexpected group size
        }
    let {memberShared, memberSolo, memberImages} = getGroupImageInfo(groupMembers, images, clusterLookup);
/*    doubleCheckGroup({memberSolo, images })
        .then(results => 
            {
            console.log("finished checking the group images");
            console.log(results);
            });*/
    let collaborationStrengths = computeCollaborationStrengths({memberShared, memberSolo, memberImages});

// for recording stats
groupMembers.forEach((groupMember, memberNo) => 
{
collabData.push({groupNo, memberNo, ...collaborationStrengths[memberNo]});
});

//console.log(collaborationStrengths);
    // find the right template
    let templateId = "groupVisTemplate" + groupMembers.length;
    // setup html structure based on template
    let template = document.getElementById(templateId);     
console.log(groupMembers.length)    
    let rootElement = template.content.querySelector("#rootId");
    let groupElements = document.importNode(rootElement, true);
    // set unique id
    groupElements.id = "group-"+groupNo;
    // put into vizualisation, but at the end of doc, or later integrate specific "insertion point".
    document.body.appendChild(groupElements);
    // add title
    let titleElement = groupElements.querySelector("#titleId");      
    titleElement.innerHTML = "Group #" + groupNo;   
    // traverse each student
    groupMembers.forEach((groupMember, memberNo) => 
        {
        let memberId = "#memberId"+(memberNo+1);
        // get reference to the right part of the template structure
        let memberElement = groupElements.querySelector(memberId);
        memberElement.id = groupElements.id+"-"+memberNo;
        // add name of student
        let memberNameElement = memberElement.querySelector("#memberNameId");
        memberNameElement.innerText = groupMember;
        // collaboration stats/strengths
        let individualityElement = memberElement.querySelector("#individuality");
        individualityElement.innerText = collaborationStrengths[memberNo].individuality;
        let collaborationElement = memberElement.querySelector("#collaboration");
        collaborationElement.innerText = collaborationStrengths[memberNo].collaboration;

        // insert individual images
        memberSolo[memberNo].forEach(index => 
            {
            let image = new Image();
            image.src = images[index].imageURL;
            image.onload = () => 
                {
                image.style.margin = "2px";
                image.alt = `(${index})`;
                image.onmouseover = showBigImage;
                image.onmouseout = hideBigImage;                
                memberElement.appendChild(image);
                }
            });
        });

    // current implementation does not distinguish between who shared what - perhaps later if need.  Simply shows individual or shared categories for simplicity.
    // get reference to shared area
    let sharedElement = groupElements.querySelector("#sharedId");  

    memberShared.flat().forEach(index => 
        {
        let image = new Image();
        image.src = images[index].imageURL;
        image.onload = () => 
            {
            image.style.margin = "2px";
            image.alt = `(${index})`;
            image.onmouseover = showBigImage;
            image.onmouseout = hideBigImage;
            sharedElement.appendChild(image);
            }          
        });
    }


let collabData = [];


function showBigImage(event)
    {
    let dialogElement = document.getElementById("fullImageId");
    let popupImageElement = document.getElementById("popupImageId");
    popupImageElement.src = event.target.src;
    popupImageElement.style.width = "300px";
    document.getElementById("popupImageInfoId").innerText =  event.target.alt;
    dialogElement.showModal();
    }
function hideBigImage(event)
    {
    document.getElementById("fullImageId").close();
    }
"use strict"

let imageJson = null;
let sourceInfo = null;

let clusters = null;
let histograms = null;
let json = null;
let fuzzyClusters = null;
let borrowedImages = null;

let visualizationElement = null;

let  preview1 = null;

let imageHashes;

window.addEventListener('DOMContentLoaded', (event) => setupImageBrowser());

   
/** Updates the file variable and checks if computation is ready. */
function handleFileChange(event, previewElement) 
    {
    const file = event.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        previewElement.src = url;
        previewElement.style.display = 'block';
    } else {
        previewElement.src = '';
        previewElement.style.display = 'none';
    }


   // compute
    console.log("ready to compute");

    previewElement.onload = () => 
        {
            console.log("image loaded now") 
        //        .then(response => response.json())
// retrieve image to json
    let canvas = document.createElement("canvas");
    canvas.width = previewElement.naturalWidth;
    canvas.height = previewElement.naturalHeight;
//    canvas.width = previewElement.width;
//    canvas.height = previewElement.height;
    let ctx = canvas.getContext("2d");
    ctx.drawImage(previewElement, 0, 0);
    let imageURL = canvas.toDataURL();
//     console.log(imageURL);   
//document.body.appendChild(canvas);
    //const exemplarJson.imageURL = imageURL;
//    unifiedDownSampling([exemplarJson])

// d-hash experiment
//    findMatchingImage(previewElement, imageJson);
//throw "halt";

    unifiedDownSampling([{imageURL}])
        .then(exemplarJson =>
            { 
  //              console.log(exemplarJson);
            return imageLookup(exemplarJson[0], json);
            })
        .then(result => 
            {
            console.log("Result of search");
            console.log(result)
            const matches = new Set(result.map(({j}) => j));
            const matchingImages = json.filter((e,i) => matches.has(i));
            clearVisualization();
            addVisualizationHeader("Matching images");
            viewImages(matchingImages);
            });
        };

}


function clearVisualization()
    {
    visualizationElement.innerHTML = "";  // clear
    }
function addVisualizationHeader(text)
    {
    let h1 = document.createElement("h1");
    h1.innerText = text;
    visualizationElement.appendChild(h1);
    }

async function setupImageBrowser()
    {
    visualizationElement = document.getElementById("visualization-area");
    preview1 = document.getElementById('image1-preview');
    // Add GUI handlers
    document.getElementById('image1-input').addEventListener('change', (e) => handleFileChange(e, preview1));
    document.getElementById("image-files")
            .addEventListener('change', (event) => loadImagesFromFile(event)); 
    document.getElementById("viewAll")
            .addEventListener('click', () => 
                {
                clearVisualization();
                addVisualizationHeader("All images");
                viewImages(imageJson);
                }); 
    document.getElementById("visualSummary")
            .addEventListener('click', () => 
                {
                clearVisualization();  
                addVisualizationHeader("Visual summary: student's history");                  
                visualSummary(imageJson);
                });         
    document.getElementById("viewGroups")
            .addEventListener('click', () =>
                {
                clearVisualization();      
                addVisualizationHeader("Group images");          
                viewClusters(clusters, json, histograms);
                }); 
    document.getElementById("viewFuzzyClusters")
            .addEventListener('click', () => 
                        {
                        clearVisualization();       
                        addVisualizationHeader("Fuzzy clusters");                     
                        viewClusters(fuzzyClusters.filter(cluster => cluster.length > 1).map(cluster => {cluster.length = 10; return cluster}), json, histograms);    // only include clusters with more than one, truncate clusters larger than 10, to 10 elements.
                        });     
    document.getElementById("viewGroupImages")
            .addEventListener('click', () => 
                        {
                        clearVisualization();     
                        addVisualizationHeader("Detailed group view");                       
                        let {studentGroups, individualStudents} = findStudentGroups(clusters, json); 
                        groupsVisualization({studentGroups, individualStudents, imageClusterIndices:clusters,  borrowedImages, fuzzyClusters, sourceInfo}, json);
                        });      
    }

function processImages(imageJson)
    {
    computeImageHashes(imageJson);        

    filterSmallImages(imageJson)
        .then(json => unifiedDownSampling(json))
        .then(json => firstClusteringPass(json))
        .then(results => keepValidClusters(results))
        .then(results => 
            {
            ({clusters, histograms, json, fuzzyClusters} = results); 
            document.getElementById("viewButtons").style.display = "block";                     
            });
    }

// retrieving file contents of JSON files
function loadImagesFromFile(event)
    {     
    const files = event.target.files;
    for (var i = 0, file; file = files[i]; i++) 
        {		
        var reader = new FileReader();
       
        // keep info about the source for reference
        let {lastModifiedDate, name, size} = file;
        sourceInfo = {name, lastModifiedDate, size};
        
        reader.onload = (function(theFile) 
            {
            return function(e) 
                {  
                // hide file upload controls
                document.getElementById("jsonToJoin").style.display = "none";
                // read file into json og parse
                imageJson = JSON.parse(e.target.result);
                console.log("Loaded images: ",imageJson.length);
                processImages(imageJson);
                };
            })(file);		
        reader.readAsText(file);
        }
    }


////////////



//test imageLookup
//const filename = './hci1-final-images.json';
//const queryIndex = 130;
//const filename = './hci3-final-images.json';
//const queryIndex = 5;
//const queryIndex = 6;
//const filename = './hci2-final-images.json';
//const queryIndex = 1939;
/*console.time();
fetch(filename)
    .then(response => response.json())
    .then(json => unifiedDownSampling(json))
    .then(json => imageLookup(queryIndex, json))
    .then(result => 
        {
        console.log(result)
        console.timeEnd();
        });
*/

/* Result - matching
{i: 130, j: 130, s: 1} 
{i: 130, j: 647, s: 0.7385564840186798}
*/


// imagelookup - input index of one image -json all images - return list of all images meeting the requirement
//function imageLookup(index, json)
// exemplar is one image in json format
function imageLookup(exemplar, json)
    {
    return new Promise(resolve => 
        {
//        let exemplar = json[index].imageData;
//        let promises = json.map(({imageData},j) => imageSimilarity(exemplar,imageData, index, j)); 
//        let exemplar = json[index];
        let index = 0;
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




// visualization stuff

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
                visualizationElement.appendChild(heading); 
                }    
            visualizationElement.appendChild(image);
            // add simple explanation
//            let caption = document.createElement("p");
//            caption.innerText = "Figure "+ (figureNo++) + ": Page "+entry.page + " of " + entry.name;
//            visualizationElement.appendChild(caption);
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
            visualizationElement.appendChild(image);
            // add simple explanation
            let caption = document.createElement("p");
            caption.innerText = "Figure "+ (figureNo++) + ": Page "+entry.page + " of " + entry.name + " width:"+ entry.imageWidth + ", height:"+entry.imageHeight;
            visualizationElement.appendChild(caption);
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
            visualizationElement.appendChild(image);
            // add simple explanation
            let caption = document.createElement("p");
            caption.innerText = "Figure "+ (figureNo++) + ": Page "+entry.page + " of " + entry.name;
            visualizationElement.appendChild(caption);
            }
        });    
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
        results = results.filter(entry => entry != undefined);
        let heading = document.createElement("h1");
        heading.innerText = "Cluster: " + clusterNo;
        visualizationElement.appendChild(heading);                
        // insert images
        results.map(({image, imageNo}) => 
            {
            visualizationElement.appendChild(image);     
            let caption = document.createElement("span");
            caption.innerText = "(" + imageNo + ")";
            visualizationElement.appendChild(caption);                       
            });
        // insert captions in list at the bottom for simpler interpretation.
        results.map(({imageNo, imageIndex}) => 
            {
            let {name, page} = json[imageIndex];
            let caption = document.createElement("p");
            caption.innerText = `(${imageNo}/${imageIndex}): ${name} (page ${page})`; 
//            caption.innerText = `(${imageNo}/${imageIndex}): ${histograms[imageIndex]} ${name} (page ${page}), aspect: ${aspectRatio}`; 
            visualizationElement.appendChild(caption);                          
            });
        }); 
    }

// for each cluster make visualization
function groupsVisualization(clusters, images)
    {
    // label each image with index for easy reference
    images = images.map((image, index) => ({...image, index}));
    // create convenient lookup structure
console.log(clusters);    
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

// for logging
//let collabData = [];

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
/*groupMembers.forEach((groupMember, memberNo) => 
{
collabData.push({groupNo, memberNo, ...collaborationStrengths[memberNo]});
});*/

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
    visualizationElement.appendChild(groupElements);
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



// testing dhash - experiment

      /**
         * Converts an HTML Image element into a dHash (Difference Hash) as a binary string.
         * dHash is robust to resizing, compression, and light/color shifts.
         * @param {HTMLImageElement} img - The loaded image.
         * @param {HTMLCanvasElement} canvas - The hidden canvas element to use for drawing.
         * @param {number} size - The size of the reduced image grid (e.g., 8). Hash size will be size * (size + 1) bits.
         * @returns {string} The binary dHash string.
         */
        function getDHash(img, canvas, size = 8) {
            const width = size + 1; // 9
            const height = size;     // 8
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // 1. Resize and draw in grayscale
            ctx.drawImage(img, 0, 0, width, height);

            let hash = '';
            
            // 2. Iterate through rows
            for (let y = 0; y < height; y++) {
                // Get pixel data for the row
                const rowData = ctx.getImageData(0, y, width, 1).data;
                
                // 3. Compare adjacent pixels in the row
                for (let x = 0; x < width - 1; x++) {
                    // Pixels are in RGBA format (4 bytes per pixel)
                    // We only need the Red channel for grayscale comparison (a rough measure of brightness)
                    const index1 = x * 4;
                    const index2 = (x + 1) * 4;
                    
                    const p1_brightness = rowData[index1];   // Red channel of pixel x
                    const p2_brightness = rowData[index2]; // Red channel of pixel x+1
                    
                    // If the first pixel is brighter than the second, the bit is 1, otherwise 0
                    hash += (p1_brightness > p2_brightness ? '1' : '0');
                }
            }
            return hash; // Will be 8 * 8 = 64 bits long
        }

        /**
         * Calculates the Hamming Distance (number of differing bits) between two binary strings.
         * @param {string} hash1 - The first binary hash.
         * @param {string} hash2 - The second binary hash.
         * @returns {number} The Hamming distance.
         */
        function hammingDistance(hash1, hash2) {
            let distance = 0;
            // Assuming hashes are the same length (64 bits)
            for (let i = 0; i < hash1.length; i++) {
                if (hash1[i] !== hash2[i]) {
                    distance++;
                }
            }
            return distance;
        }

        /**
         * Computes the final similarity score (0 to 1).
         * @param {HTMLImageElement} img1 - First image.
         * @param {HTMLImageElement} img2 - Second image.
         * @returns {number} Similarity score between 0 (dissimilar) and 1 (similar).
         */
        function computeSimilarity(img1, img2) {
            const canvas1 = document.getElementById('canvas1');
            const canvas2 = document.getElementById('canvas2');
            const hash1 = getDHash(img1, canvas1);
            const hash2 = getDHash(img2, canvas2);
            
            if (hash1.length !== hash2.length || hash1.length === 0) {
                console.error("Hash length mismatch or zero length.");
                return 0;
            }

            const distance = hammingDistance(hash1, hash2);
            const maxDistance = hash1.length; // 64
            
            // Score = 1 - (Distance / Max_Distance)
            const similarity = 1 - (distance / maxDistance);
            
            return parseFloat(similarity.toFixed(4));
        }

function computeImageHashes(json)
   {
   console.log("about to compute image hashes");
   Promise.all(json.map((imageJson,imageIndex) => new Promise(resolve => 
        {
        let {imageURL} = imageJson;
        let image = new Image();
        image.src = imageURL;
        image.onload = () => 
            {
            let canvas = document.createElement("canvas");
            let hash = getDHash(image, canvas);
            canvas.remove();
            resolve(hash);
            }      
        })))
    .then(results => // when all images are loaded and hashes computed assign to global
        {   
        imageHashes = results.map((hash,index) => ({index, hash}));
        console.log("finished computing image hashes");
console.log(imageHashes)        
        }); 
    }

function findMatchingImage(queryImage, allImages)
    {
    // get hash for the query image
    let canvas = document.createElement("canvas");
    let queryHash = getDHash(queryImage, canvas);
console.log(queryHash);

    canvas.remove();
    // look it up
    const distances = imageHashes.map(image => ({...image, distance: hammingDistance(image.hash, queryHash)}));
    distances.sort((a,b) => b.distance - a.distance);
//console.log(distances);    
    distances.length = Math.min(10, distances.length);
const result = distances;
//    const result = imageHashes.filter(image => hammingDistance(image.hash, queryHash) > 48);
console.log(result)
//console.log(result.map(image => hammingDistance(image.hash, queryHash)));
    const matches = new Set(result.map(({index}) => index));
    const matchingImages = allImages.filter((e,i) => matches.has(i));
    clearVisualization();
    addVisualizationHeader("d-Hash matching images");
    viewImages(matchingImages);
    }

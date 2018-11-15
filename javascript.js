//if you want to use fullwidth characters, set zenkaku_flag to false
const zenkaku_flag = false;
// threshold for binarize.
//bigger is, sparser.
let bin_threshold = 60;
//the number of pixels which one character covers. 5 or 8 or 10 or 20
let blockWidth = 5;
let blockHeight;
if(zenkaku_flag)
    blockHeight = blockWidth;
else
    blockHeight = blockWidth*2;

let camera;
let posAberr = {'width': 0, 'height': 0}; //position aberration of ctracker.getCurrentPosition()

const medias = {audio : false, video : {
    facingMode: "user" // access to front camera.
}};

//document.addEventListener('touchmove', function(e) {e.preventDefault();}, {passive: false});
let video =document.getElementById("myVideo");
video.setAttribute("playsinline", true);
var canvas = document.getElementById("canvas");
let context = canvas.getContext("2d");
canvas.hidden = true;

const sumup = (accumulator, currentValue) => accumulator + currentValue;
//extracted features of prepared character images 
const dataset = downloadPixelData();
//let testcanvas = document.getElementById("testcanvas");
//let testctx = testcanvas.getContext("2d");

let strAA = document.getElementById("string");
let output = document.getElementById("output");

let body = document.body;
body.setAttribute("style", "margin:0px");

navigator.mediaDevices.getUserMedia(medias).then(successCallback).catch(errorCallback);    

//buttons 
let startBtn = document.createElement("a");
startBtn.className = "button";
startBtn.id = "start";
startBtn.innerHTML = "START";
startBtn.addEventListener("click", startPlay);

let binThreBtn =document.createElement("a");
binThreBtn.className = "button";
binThreBtn.id = "binary";
binThreBtn.innerHTML = "SPARSE";
binThreBtn.addEventListener("click", changeBinThre);

let blockSizeBtn = document.createElement("a");
blockSizeBtn.className = "button";
blockSizeBtn.id = "block";
blockSizeBtn.innerHTML = "TEXT\nSIZE";
blockSizeBtn.addEventListener("click", changeBlockSize);

let ctracker;

function successCallback(stream){

    video.srcObject = stream;
    camera = new Size(stream.getTracks()[0].getSettings()["width"],
		      stream.getTracks()[0].getSettings()["height"]);

    //if we cannnot get height or width of the camera.
    //this situation happens only in iOS :(

    if(stream.getTracks()[0].getSettings()["width"] == 0){
	camera = new Size(480, 640);
    }

    video.setAttribute("width", camera.width);
    video.setAttribute("height", camera.height);
    setStyle(strAA, (canvas.height-2)/blockHeight, true);
    let windowRatio = window.innerWidth/window.innerHeight;
    //if windows is horizonal longer than webCamera.
    if(windowRatio > camera.ratio){
	canvas.width = camera.width;
	canvas.height = Math.floor(window.innerHeight*camera.width/window.innerWidth);
    }else{
	canvas.height = camera.height;
	canvas.width = Math.floor(window.innerWidth*camera.height/window.innerHeight);
    }
    posAberr['width'] = (camera.width - canvas.width)/2;
    posAberr['height'] = (camera.height - canvas.height)/2;
    ctracker = new clm.tracker();
    ctracker.init();
    //testcanvas.height = canvas.height-2;
    //testcanvas.width = canvas.width-2;
    stopPlay();
 };
function errorCallback(err) {
    alert(err);
};


function startPlay(){
    setStyle(strAA, (canvas.height-2)/blockHeight, false);
    strAA.addEventListener("click", stopPlay);
    
    output.removeChild(startBtn);
    output.removeChild(binThreBtn);
    output.removeChild(blockSizeBtn);

    video.play();
    ctracker.start(video);
    render();
}

function stopPlay(){
    setStyle(strAA, (canvas.height-2)/blockHeight, true);
    try{
	startBtn.removeEventListener("click", stopPlay);
    }catch(e){
    }
    video.pause();
    ctracker.stop();
    output.appendChild(startBtn);
    binThreBtn.innerHTML = "SPARSE";
    output.appendChild(binThreBtn);
    blockSizeBtn.innerHTML = "TEXT\nSIZE";
    output.appendChild(blockSizeBtn);
}


function render(){
    try{
	context.drawImage(video, Math.floor(posAberr.width),
			  Math.floor(posAberr.height),
			  canvas.width,canvas.height,
			  0, 0, canvas.width, canvas.height);

    }catch(e){
    }
    //ctracker.draw(canvas);
    let pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let lineImage = sobelKernel(changeToGray(pixels), canvas.width, canvas.height);

    binarize(lineImage);
    //outputLine(testctx, lineImage, canvas.width-2, canvas.height-2);
    let str = changeToAA(lineImage, canvas.width-2, canvas.height-2);
    /*
    console.log('blockwidth = ' + blockWidth + ', blockheight = ' + blockHeight);
    console.log('canvas: width = ' + canvas.width + ', height= ' + canvas.height);
    console.log('string: width = ' + str[0].length + ', height= ' + str.length);
    */
    if(ctracker.getCurrentPosition() != false){
	const face_arr  = ctracker.getCurrentPosition().slice();
	//console.log(face_arr);
	//console.log(posAberr);
	addFeaturesToStr(str, face_arr, posAberr);
    }
    strAA.innerText = str.join("\n");
    if(!video.paused)
	window.requestAnimationFrame(render);
}


function convertRange(range, maxWidth, maxHeight){
    range.left = Math.min(Math.floor((range.left - posAberr['width'])/(blockWidth+1)),
			  maxWidth);
    range.left = Math.max(0, range.left);
    
    range.right = Math.min(Math.floor((range.right - posAberr['width'])/(blockWidth+1)),
			   maxWidth);
    range.right = Math.max(0, range.right);
    
    range.upper = Math.min(Math.floor((range.upper - posAberr['height'])/blockHeight),
			   maxHeight);
    range.upper = Math.max(0, range.upper);
    
    range.lower = Math.min(Math.floor((range.lower - posAberr['height'])/blockHeight),
			   maxHeight);
    range.lower = Math.max(0, range.lower);
}

function shouldBeAdded(range, maxWidth, maxHeight){
    return ((range.left%maxWidth == 0  && range.right%maxWidth  == 0) ||
	    (range.upper%maxHeight == 0 && range.lower%maxHeight == 0));
}

function overwrite(str_arr, ranges){
    for(let i = 0; i < ranges.length; ++i){
	let range = ranges[i];
	convertRange(range, str_arr[0].length-1, str_arr.length-1);
	if(shouldBeAdded(range, str_arr[0].length-1, str_arr.length-1))
	    continue;
	for(let h = range.upper; h <= range.lower; h += 1){
	    //console.log(str_arr[h]);
	    str_arr[h] = str_arr[h].slice(0, range.left) + range['char'].repeat(range.right - range.left+1) + str_arr[h].slice(range.right+1);

	}
    }
}

function addFeaturesToStr(str_arr, face_arr, posAberr){
    let ranges = [];


    //right eye
    ranges.push({'left': face_arr[23][0],
		 'right': face_arr[25][0],
		 'upper': face_arr[24][1],
		 'lower':face_arr[26][1],
		 'char': '#'
		});
    //left eye
    ranges.push({'left': face_arr[30][0],
		 'right': face_arr[28][0],
		 'upper': face_arr[29][1],
		 'lower':face_arr[31][1],
		 'char': '#'
		});

    ranges.push({'left': face_arr[61][0],
		 'right': face_arr[59][0],
		 'upper': face_arr[60][1],
		 'lower':face_arr[57][1],
		 'char': '*'
		});
    //right eyeburrow
    ranges.push({'left': face_arr[20][0],
		 'right': face_arr[21][0],
		 'upper': face_arr[21][1]-blockHeight,
		 'lower':face_arr[21][1]-blockHeight,
		 'char': '-'
		});

    //left eyeburrow
    ranges.push({'left': face_arr[17][0],
		 'right': face_arr[16][0],
		 'upper': face_arr[16][1]-blockHeight,
		 'lower':face_arr[16][1]-blockHeight,
		 'char': '-'
		});

    ranges.push({'left': face_arr[41][0],
		 'right': face_arr[41][0],
		 'upper': face_arr[41][1],
		 'lower':face_arr[62][1],
		 'char': '+'
		});
    
    overwrite(str_arr, ranges);
}

//return array of which each elemnt is String representing one row.
function changeToAA(pixels, width, height){
    let res = [];
    
    for(let i = 0; i < height; i += blockHeight){
	let row = "";
	//this plus 1 is needed for keeping ratio
	for(let j = 0; j < width; j += blockWidth+1){
	    let block = getPixels(pixels, j, i, width, height);
	    row += classifyImg(block, blockWidth, blockHeight);
	}
	res.push(row);
    }
    return res;
}

//get pixels in the block whose left-upper is (dx, dy) and (width, height) is (imgWidth, imgHeight)
function getPixels(pixel, dx, dy, imgWidth, imgHeight){
    let res = [];
    for(let h = dy; h < dy + blockHeight; h++){
	res = res.concat(pixel.slice(h*imgWidth+dx, h*imgWidth+(dx+blockWidth)));
    }
    return res;
}

//this function is for test
function outputLine(ctx, monoArray, width, height){
    let lineImage = ctx.createImageData(width, height);
    let lineData = lineImage.data;
    for(let i = 0; i < lineData.length; i += 4){
	let pixel = monoArray[Math.floor(i/4)]*255;

	lineData[i] = pixel;
	lineData[i+1] = pixel;
	lineData[i+2] = pixel;
	lineData[i+3] = 255;
    }
    ctx.putImageData(lineImage, 0, 0);
}






//extract feature values.
function getFeatureArr(pixelData, width, height){
    let res = Array(blockWidth*2);
    
    for(let w = 0; w < width;w++){
	let dist = -1;
	for(let h = 0; h < height; h++){
	    if(pixelData[h*width+w] == 1){
		dist = h;
		break;
	    }
	}
	res[w*2] = dist;
	dist = -1;
	for(let h = height-1; h >= 0; h--){
	    if(pixelData[h*width+w] == 1){
		dist = h;
		break;
	    }
	}
	res[w*2+1] = dist;
    }
    return res;
}

//return one character which is the most-matched to the target block
function classifyImg(pixelData, width, height){
    const sum = pixelData.reduce(sumup);
    if(sum < 5)
	return " ";

    const feaArr = getFeatureArr(pixelData, width, height);
    let bestKey = " ";
    let minDiff = 1000000;
    for(let key in dataset){
	let diff = 0;
	let target = dataset[key];
	for(let i = 0; i < target.length; i++){
	    if(target[i] == -1 || feaArr[i] == -1)
		diff += blockWidth;
	    else
		diff += Math.abs(target[i] - feaArr[i]);
	}
	if(diff < minDiff){
	    bestKey = key;
	    minDiff = diff;
	}
    }

    return bestKey;
}

//return the array which length is data.length/4.
function changeToGray(data){
    let newLength = data.length/4;
    let newData = Array(newLength);
    for(let i = 0; i < data.length; i += 4){
	newData[Math.floor(i/4)] = Math.round(data[i]*0.3 + data[i+1]*0.59 + data[i+2]*0.11);
    }
    return newData;
}

function binarize(data){
    for(let i = 0; i < data.length; i++){
	if(data[i]> bin_threshold){
	    data[i] = 1;
	}else{
	    data[i] = 0;
	}
    }
}

function binarizeR(data){
    for(let i = 0; i < data.length; i++){
	if(data[i] < 255-bin_threshold){
	    data[i] = 1;
	}else{
	    data[i] = 0;
	}
    }
}

function sobelKernel(data, oriWidth, oriHeight){
    const width = oriWidth-2;
    const height = oriHeight-2;
    const newLength = width * height;

    const kx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const ky = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    let newdata = Array(newLength);

    let i = 0;
    for(let y = 0; y < height; y++){
	for(let x = 0; x < width; x++){
	    const upleft = y*oriWidth+x;
	    let res_x = 0;
	    for(let k = 0; k < 3; k++){
		res_x += kx[k*3+0]*data[upleft]
		    + kx[k*3+1]*data[upleft+1]
		    + kx[k*3+2]*data[upleft+2];
	    }
	    let res_y = 0;
	    for(let k = 0; k < 3; k++){
		res_y += ky[k*3+0]*data[upleft]
		    + ky[k*3+1]*data[upleft+1]
		    + ky[k*3+2]*data[upleft+2];
	    }
	    newdata[i] = Math.sqrt(Math.pow(res_x, 2) + Math.pow(res_y, 2));
	    i++;
	}
    }
    return newdata;
}

function sobelFilterColor(data, oriWidth, oriHeight){
    const newLength = (oriWidth-2)*(oriHeight-2)
    let res = Array(newLength);
    res.fill(0);
    for(let c = 0; c < 3; c++){
	let oneColorImage = Array(newLength);
	for(let i = 0 ; i < oriWidth*oriHeight; i++){
	    oneColorImage[i] = data[4*i+c];
	}
	let oneColorLine = sobelKernel(oneColorImage, oriWidth, oriHeight);
	for(let i = 0; i < newLength; i++){
	    if(res[i] < oneColorLine[i])
		res[i] = oneColorLine[i];
	}
    }
    return res;
}

function prewittFilter(data, oriWidth, oriHeight){
    const width = oriWidth-2;
    const height = oriHeight-2;
    const newLength = width * height;

    const kx = [-1, 0, 1, -1, 0, 1, -1, 0, 1];
    const ky = [-1, -1, -1, 0, 0, 0, 1, 1, 1];
    let newdata = Array(newLength);

    let i = 0;
    for(let y = 0; y < height; y++){
	for(let x = 0; x < width; x++){
	    const upleft = y*oriWidth+x;
	    let res_x = 0;
	    for(let k = 0; k < 3; k++){
		res_x += kx[k*3+0]*data[upleft]
		    + kx[k*3+1]*data[upleft+1]
		    + kx[k*3+2]*data[upleft+2];
	    }
	    let res_y = 0;
	    for(let k = 0; k < 3; k++){
		res_y += ky[k*3+0]*data[upleft]
		    + ky[k*3+1]*data[upleft+1]
		    + ky[k*3+2]*data[upleft+2];
	    }
	    newdata[i] = Math.sqrt(Math.pow(res_x, 2) + Math.pow(res_y, 2));
	    i++;
	}
    }
    return newdata;
}

function setStyle(elem, numOfRow, stopped){
    const sum = 100;
    let fontSize = sum/numOfRow;

    //let common1 = "font-size:"
    let common1 = "height:100vh; width:100vw; font-size:"
    let common2 = "vh; font-family:monospace; margin:0px; text-align:center;line-height: 1em;letter-spacing: 0em;"
    let back;

    //if screen stopped, change the color of characters to gray.
    //if not, change that to black
    if(stopped)
	back = "color: gray;";
    else
	back = "color: black";    
    if(zenkaku_flag){
	elem.setAttribute("style", common1 + fontSize/2 + common2+back);
    }else{
	elem.setAttribute("style", common1 + fontSize + common2+back);
    }
}

// change threshold for binarizing.
function changeBinThre(){
    let threList = [40, 60, 80];
    bin_threshold = threList[(Math.floor((bin_threshold-40)/20)+1)%threList.length];
    binThreBtn.innerHTML = bin_threshold;
    render();
}

function changeBlockSize(){
    let sizeList = [5, 8, 10];
    let currentPos =sizeList.indexOf(blockWidth);

    blockWidth = sizeList[(currentPos+1)%sizeList.length];
    blockSizeBtn.innerHTML = blockWidth;
    if(zenkaku_flag)
	blockHeight = blockWidth;
    else
	blockHeight = blockWidth*2;

    setStyle(strAA, (canvas.height-2)/blockHeight, true);
    render();
}


function Size(width, height){
    this.width = width;
    this.height = height;
    this.ratio = width/height;
}


//download  and binarize prepared character images. and extract features
function downloadPixelData(){

    let filenames, nameList = [], asset_path="assets/";
    if(zenkaku_flag){
	asset_path += "full_width/"+blockWidth;
	filenames = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンー｜／＼（）";
	nameList = filenames.split("");

    }else{
	asset_path += "half_width/"+blockWidth;
	//filenames = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ|-()";
	filenames = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾜｦﾝ|-()";
	nameList = filenames.split("");
	nameList.push("s0");
	nameList.push("s1");
    }

    let charImgs = {};
    let canvases = {};
    let ctxes = {};
    let res = {};
    
    for(let imgName of nameList){
	charImgs[imgName] = new Image();
	canvases[imgName] =document.createElement("canvas");
	canvases[imgName].width = blockWidth;
	canvases[imgName].height = blockHeight;
	ctxes[imgName] = canvases[imgName].getContext("2d");

	charImgs[imgName].addEventListener("load", function() {
	    ctxes[imgName].drawImage(charImgs[imgName], 0, 0, canvases[imgName].width, canvases[imgName].height);
	    let pixels = ctxes[imgName].getImageData(0, 0, canvases[imgName].width, canvases[imgName].height).data;
	    let monoImage = changeToGray(pixels);
	    binarizeR(monoImage);
	    let features = getFeatureArr(monoImage, canvases[imgName].width, canvases[imgName].height);
	    /*
	    if(imgName == "s0")
		res["/"] = features;
	    else if(imgName == "s1")
		res["\\"] = features;
	    else
	    */
	    res[imgName] = features;
	}, false);
	charImgs[imgName].src = asset_path+"/"+imgName+".png";
    }
    return res;
}

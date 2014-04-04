/* global $, d3, languagegroups, languagegroup_map */
"use strict";

//=================================================================
// Global variables
//=================================================================

var user_status = 'public'; // 'public' or 'subscriber'

var startyear = 1150,
    endyear = 2010,
    current_year = startyear,
    framerate,
    map_animator,
    button_animator,
    control_panel_centered = true;

// D3 variables
var canvas,
    canvas_width,
    canvas_height,
    projection = d3.geo.equirectangular(),
    worldmap,
    x_scale,
    y_scale,
    dotscaler;

// Variables for datasets and their derivatives
var allwords,
    word_dots,
    languages,
    examples,
    running_totals,
    running_counts,
    progress_bar_data,
    progress_bars,
    endtotal,
    increase_rates,
    increase_max_frequency,
    increase_circle,
    year_label;

var player = function () { current_year += 1; updateData(); };



//=================================================================
// Colour-coding for major language groups
//=================================================================

var languagegroups = [
	{code: 'g', label: 'Germanic', hex: '#0000FF', include_in_key: true, text: 'Words derived from Germanic languages', textcolour: 'white'},
	{code: 'r', label: 'Romance', hex: '#FF0000', include_in_key: true, text: 'Words derived from Romance languages', textcolour: 'white'},
	{code: 'l', label: 'Latin', hex: '#00FF00', include_in_key: true, text: 'Words derived from Latin', textcolour: 'black'},
	{code: 'k', label: 'Greek', hex: '#66CCFF', include_in_key: true, text: 'Words derived from Greek', textcolour: 'black'},
	{code: 'o', label: 'other', hex: '#FFDE00', include_in_key: true, text: 'Words derived from other languages', textcolour: 'black'},
	{code: 'e', label: 'English', hex: '#FFFFFF', include_in_key: false, text: 'Compounds and derivativesformed from existing English words', textcolour: 'black'},
	{code: 'fallback', label: 'unknown', hex: '#E95D22', include_in_key: false, text: 'unknown', textcolour: 'black'},
];

var languagegroup_map = {};
for (var i = 0; i < languagegroups.length; i += 1) {
	var group = languagegroups[i];
	languagegroup_map[group.code] = group;
	languagegroup_map[group.label] = group;
}



//=================================================================
// D3 variables
//=================================================================

// Determine the width that will be used for the canvas
//  (height gets computed from this later, in the drawMap() function)
canvas_width = window.innerWidth * .95;
if (canvas_width < 950) {
    canvas_width = 950;
} 

var tooltip = d3.select("#tooltip");
var tooltip_jq = $('#tooltip');
// hide the tooltip until invoked
tooltip.style("opacity", 0);

var control_panel = d3.select("#controlPanel");
// make the control panel draggable (using jqueryUI)
$('#controlPanel').draggable({cancel: false, handle: "#controlPanelHandle"});

// Control-panel button that will flash when the page is first loaded
var flashy_button = d3.select("#flashingButton")


loadData();



//=================================================================
// Startup functions
//=================================================================

function loadData() {
    // Load all the data.
    // Since these are separate JSON files that will be loaded
    //   asynchronously, we chain the loaders so that each file starts to
    //   load only once the previous file has completed loading.
    // At the end of the chain we run the initialState() function,
    //   which makes the controls visible, etc. Everything from that point
    //   on assumes that all the data files have completed loading.

    // load and display the world map
    d3.json("data/world-110m2.json", function (error, topology) {
        // get the map drawn asap, so that we know canvas height, scalings, etc.
        drawMap(topology);

        // Add loading message (This will be removed once the data is loaded)
        var loading_message = canvas.append("text")
            .attr("x", canvas_width * 0.5)
            .attr("y", canvas_height * 0.5)
            .attr("text-anchor", "middle")
            .text("Loading data...")
            .style("font-size", "70px");

        // load words
        d3.json("data/words.json", function (error, words) {
            allwords = words;
            // load languages data
            d3.json("data/languages.json", function (error, langs) {
                languages = langs;
                // set up counters for each language (used to ratchet through geo points)
                for (var i = 0; i < languages.length; i += 1) {
                    languages[i].counter = 0;
                }
                // load examples
                d3.json("data/examples.json", function (error, ex) {
                    examples = ex;
                    // load running totals
                    d3.json("data/running_totals.json", function (error, rt) {
                        running_totals = rt.summedfrequencies;
                        running_counts = rt.counts;
                        // load increase rates
                        d3.json("data/increase_rates.json", function (error, incr) {
                            increase_rates = incr;

                            // Remove the loading message
                            loading_message.remove();

                            // Now that everything's been loaded, set the initial state
                            initialState();
                        });
                    });
                });
            });
        });
    });   
};


function drawMap(topology) {
    var b,
        geography_path,
        computed_scale,
        map_height;
    var world = topojson.feature(topology, topology.objects.countries);

    // create the path
    geography_path = d3.geo.path()
        .projection(projection);
 
    // Try projection with scaling set to 1
    projection
        .scale(1)
        .translate([0, 0]);

    // Get the bounds for the resulting map 
    b = geography_path.bounds(world);

    // Derive the scale relative to the width of the containing box
    computed_scale = 1 / ((b[1][0] - b[0][0]) / canvas_width);

    // Re-try projection with new scaling
    projection
        .scale(computed_scale)
        .translate([0, 0]);

    // Get the bounds for the new resulting map 
    b = geography_path.bounds(world);

    // Derive the height for the map
    map_height = Math.abs(b[0][1] - b[1][1]);
    // Make the height of the canvas slightly less than the height of the map itself,
    //  so that we can lose some of the Antarctic
    canvas_height = map_height * 0.85;

    // Create the SVG canvas and background
    createCanvas();

    // Recompute the translation
    var translation = [(canvas_width - (b[1][0] + b[0][0])) / 2, (map_height - (b[1][1] + b[0][1])) / 2];

    // Reset the projection
    projection
        .scale(computed_scale)
        .translate(translation);

    worldmap = canvas.append("g");
    worldmap.selectAll("path")
        .data(world.features)
        .enter()
        .append("path")
        .attr("d", geography_path);
}

function createCanvas() {
   // Create the SVG element (as a child of the #mapContainer div)
    canvas = d3.select("#mapContainer").append("svg")
        .attr("width", canvas_width)
        .attr("height", canvas_height)
        .attr("overflow", "hidden");

    // Add a blue rectangle the same size as the SVG element, for the background sea
    canvas.append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", canvas_width)
        .attr("height", canvas_height)
        .attr("class", "seaBackground");
}


function randomCoordinates(d) {
    // assign random coordinates to a data point
    var language = languages[d[4]];
    // advance the counter for this language, so we get different coords from last time 
    language.counter += 1;
    if (language.counter === language.c.length) {
        language.counter = 0;
    }
    // return the coordinates for this language at the current counter position
    return language.c[language.counter];
}


function initialState() {
    // Set up the initial state (this runs as soon as all the data has been loaded)

    // x-axis scale (0 to 1)
    x_scale = d3.scale.linear()
        .domain([0, 1])
        .range([0, canvas_width]);

    // y-axis scale (0 to 1)
    y_scale = d3.scale.linear()
        .domain([0, 1])
        .range([0, canvas_height]);

    // coefficient used to set the radius of dots
    dotscaler = x_scale(.001)

    // add coordinates to each data point (as elements 5 + 6 of the datum array)
    // - element #5 = longitude(x)
    // - element #6 = latitude(y)
    var coords, longitude, latitude, xy
    for (var yr in allwords) {
        for (var i = 0; i < allwords[yr].length; i += 1) {
            coords = randomCoordinates(allwords[yr][i]);
            longitude = coords[1];
            latitude = coords[0];
            xy = projection([longitude, latitude]);
            allwords[yr][i].push(xy[0]);
            allwords[yr][i].push(xy[1]);
        }
    }

    var year_label_x = canvas_width * .06,
        year_label_y = canvas_height * .9,
        year_label_size = canvas_height * .1; 

    // Initialize the circle showing rate of increase
    setupIncreaseCircle(year_label_x, year_label_y, year_label_size);

    // Initialize the progress bars
    setupProgressBars();

    // year label
    year_label = canvas.append("text")
        .attr("id", "yearlabel")
        .attr("text-anchor", "middle")
        .attr("x", year_label_x)
        .attr("y", year_label_y)
        .style("font-size", year_label_size + "px")
        .text("");

    // Scale the text showing examples
    $("#examples").css("font-size", (canvas_height * .07) + "px");

    // Update the map display
    updateData();

    // Generate the colour-coding key
    generateKey();

    // Make the control panel visible (and positioned in the centre)
    control_panel
        .style("display", "block")
        .style("left", String(canvas_width * 0.4) + "px")
        .style("top", String(canvas_height * 0.4) + "px");

    // Make the 'play' button flash
    button_animator = setInterval(function () {
        flashy_button.transition()
            .duration(300)
            .style("opacity", 0)
            .each("end", function() {
                flashy_button.transition()
                    .duration(300)
                    .style("opacity", 1)
            });
    }, 1000);
}



//=================================================================
// Colour-coding key
//=================================================================

function generateKey() {
	var container = $('#keyContainer');
	var keystring = '<span>Key:</span>';
	for (var i = 0; i < languagegroups.length; i += 1) {
		var group = languagegroups[i];
		if (group.include_in_key) {
			keystring += '<span style="background-color: ' + group.hex + '; color: ' + group.textcolour + '" title="' + group.text + '">' + group.label + '</span>'; 
		}
	}
	container.html(keystring);
}



//=================================================================
// Update functions
//=================================================================

function link_to_oed_entry(d, text, include_title) {
	var link = '<a href="http://www.oed.com/view/Entry/' + d[0] + '" target="oed"';
	if (include_title) {
		link += ' title="View entry in OED Online"';
	}
    return link + '>' + text + '</a>';
}

function link_to_oed_search(d, text) {
    return '<a href="http://www.oed.com/search?scope=ENTRY&langClass=' + searchableLanguage(d) + '" target="oed">' + text + '</a>';
}

function link_to_ngram_viewer(d, text) {
    return '<a href="http://books.google.com/ngrams/graph?content=' + d[1] + '&year_start=1800&year_end=2000&corpus=15&smoothing=3" target="oed">' + text + '</a>';
}

function dotLabel(d) {
    var html, fvalue;
    if (user_status === 'subscriber') {
    	html = "<div class=\"lemma\">" + link_to_oed_entry(d, d[1], false) + "</div>";
    }
    else {
        html = "<div class=\"lemma\">" + d[1] + "</div>";	
    }
    html += "<div>" + languageFromIndex(d) + "</div>";
    if (d[3] <= 0.0001) {
        fvalue = "&lt; 0.0001";  
    }
    else {
        fvalue = "approx. " + d[3]; 
    }
    html += "<div>Frequency in modern English: " + fvalue + " per million words</div>";
    if (user_status === 'subscriber') {
    	html += "<div>View in: " + link_to_oed_entry(d, "OED Online") + " | " + link_to_ngram_viewer(d, "Ngram Viewer") + "</div>";
    	html += "<div>" + link_to_oed_search(d, "Find more") + "</a> like this in OED Online</div>";
    }
    return html;
}

function dotSize(d) {
    return (10 - d[2]) * dotscaler;
}

function languageGroup(d) {
    return languages[d[4]].g;
}

function languageFromIndex(d) {
    return languages[d[4]].l;
}

function searchableLanguage(d) {
    var language = languageFromIndex(d);
    var tokens = language.split(" ");
    if (tokens[tokens.length-1] === "Spanish") {
        return "Spanish";
    }
    else if (tokens[tokens.length-1] === "Dutch") {
        return "Dutch";	
    }
    else {
        return language;
    }
}

function fillColour(lang_group) {
	if (languagegroup_map[lang_group]) {
		return languagegroup_map[lang_group].hex;
	} else {
		return languagegroup_map['fallback'].hex; 
	}
}

function compile_examples() {
	var current_examples = examples[String(current_year)];
	var links = [];
    for (var i = 0; i < current_examples.length; i += 1) {
        var ex = current_examples[i];
        links.push(link_to_oed_entry(ex, ex[1], true));
    }
    return links.join(', ') + '&nbsp;'; // include &nbsp; so the space never collapses
}


function updateData() {
    // Update the year label
    year_label.text(current_year);

    // Update the examples
    $("#examples").html(compile_examples());

    var words_this_year = allwords[String(current_year)];
    if (current_year > startyear) {
        words_this_year = words_this_year.concat(allwords[String(current_year - 1)]);
    }

    word_dots = worldmap.selectAll(".dot")
        .data(words_this_year, function (d) { return d[0]; });

    word_dots.enter().append("circle")
        .attr("class", "dot")
        .attr("cx", function (d) { return d[5]; })
        .attr("cy", function (d) { return d[6]; })
        .style("fill", function (d) {
            return fillColour(languageGroup(d));
        })
        .attr("r", function (d) {
            return dotSize(d);
        });

    word_dots
        .on("mouseover", function (d) {
            tooltipOn(dotLabel(d));
        })
        .on("mouseout", function () {
            tooltipOff(3000);
        });

    // Remove old word_dots
    word_dots.exit()
        .remove();

    updateIncreaseCircle();

    // Update progress bars
    updateProgressBars()

    // Stop playing when we reach the end year
    if (current_year >= endyear) {
        playStop();
    }
};


//=================================================================
// Progress bar functions
//=================================================================

function progressLanguageLabel(i) {
    if (i === 0) { return "Germanic"; }
    else if (i === 1) { return "English"; }
    else if (i === 2) { return "Romance"; }
    else if (i === 3) { return "Latin"; }
    else if (i === 4) { return "Greek"; }
    else if (i === 5) { return "other"; }
    else { return "other"; }
}

function progressBarLabel(d) {
    var div1 = "<div>" + languagegroup_map[d.label].text + ".</div>";
    return div1 + "<div>" + d.percentage + "% of English in " + current_year + " (est.).</div><div>About " + d.count + " words.</div>";
}

function progressTotal(values) {
    var total = 0;
    for (var i = 0; i < values.length; i += 1) {
        total += values[i];
    }
    return total;
}

function progressPercentages(values) {
    var total = progressTotal(values);
    var percentages = [];
    for (var i = 0; i < values.length; i += 1) {
    	var pc = (100 / total) * values[i];
    	if (pc > 2) {
        	pc = Math.round(pc);
        }
        else {
        	pc = (Math.round(pc * 10)) / 10;
        }
        percentages.push(pc);
    }
    return percentages; 
}

function progressBarLengths(values, end_total) {
    var lengths = []
    for (var i = 0; i < values.length; i += 1) {
        lengths.push(values[i] / end_total);
    }
    return lengths;
}

function progressStartPositions(bar_lengths) {
    var positions = [];
    var total = 0
    for (var i = 0; i < bar_lengths.length; i += 1) {
        positions.push(total);
        total += bar_lengths[i];
    }
    return positions;
}

function setupProgressBars() {
    endtotal = progressTotal(running_totals[String(endyear)]);
    var percentages = progressPercentages(running_totals[String(current_year)]);
    var counts = running_counts[String(current_year)];
    var bar_lengths = progressBarLengths(running_totals[String(current_year)], endtotal);
    var start_positions = progressStartPositions(bar_lengths);
    progress_bar_data = [];
    for (var i = 0; i < percentages.length; i += 1) {
        progress_bar_data.push({
            bar_length: bar_lengths[i],
            start_position: start_positions[i], 
            label: progressLanguageLabel(i),
            percentage: percentages[i],
            count: counts[i],
            fill: fillColour(progressLanguageLabel(i))
        });
    }
    progress_bars = canvas.selectAll(".progressBar").data(progress_bar_data);
    progress_bars.enter().append("rect")
        .attr("class", "progressBar")
        .attr("x", function (d) { return x_scale(d.start_position) })
        .attr("width", function (d) { return x_scale(d.bar_length) })
        .attr("y", y_scale(.96))
        .attr("height", y_scale(.04))
        .style("fill", function (d) { return d.fill });
    progress_bars
        .on("mouseover", function (d) {
            tooltipOn(progressBarLabel(d));
        })
        .on("mouseout", function () {
            tooltipOff(200);
        });
}

function updateProgressBars() {
    // Recalculate the underlying data
    var percentages = progressPercentages(running_totals[String(current_year)]);
    var counts = running_counts[String(current_year)];
    var bar_lengths = progressBarLengths(running_totals[String(current_year)], endtotal);
    var start_positions = progressStartPositions(bar_lengths);
    for (var i = 0; i < percentages.length; i += 1) {
        progress_bar_data[i].bar_length = bar_lengths[i];
        progress_bar_data[i].start_position = start_positions[i];
        progress_bar_data[i].percentage = percentages[i];
        progress_bar_data[i].count = counts[i];
    }
    // Update the progress bars with the changed data
    progress_bars.transition()
        .duration(50)
        .attr("x", function (d) { return x_scale(d.start_position) })
        .attr("width", function (d) { return x_scale(d.bar_length) });
}



//=================================================================
// Increase zone functions
//=================================================================

function increaseCircleRadius() {
    return x_scale(increase_rates[String(current_year)] / increase_max_frequency) / 3;
}

function updateIncreaseCircle() {
    increase_circle
        .attr("r", increaseCircleRadius());
}

function setupIncreaseCircle(x, y, label_size) {
    // circle showing rate of increase (centered on the year label)
    increase_circle = canvas.append("circle")
        .attr("class", "increaseCircle")
        .attr("cx", x)
        .attr("cy", y - (label_size * .4))
        .attr("r", 0);

    increase_circle
        .on("mouseover", function () {
            tooltipOn("The size of the grey circle indicates rate of growth<br/>in this period (measured as the summed<br/>frequencies of new words).");
        })
        .on("mouseout", function () {
            tooltipOff(3000);
        });

    // Find the highest values (which we'll use for scaling)
    increase_max_frequency = d3.max(d3.values(increase_rates));

    // Set the radius size
    updateIncreaseCircle();
}



//=================================================================
// Control panel functions
//=================================================================

function playStart() {
    clearInterval(map_animator);
    if (current_year === endyear) {
        current_year = startyear;
    }
    if (current_year < endyear) {
        map_animator = setInterval(player, framerate);
    }
    repositionControlPanel();
}

function playFast() {
    clearInterval(map_animator);
    if (current_year === endyear) {
        current_year = startyear;
    }
    framerate = 100;
    playStart();
    repositionControlPanel();
}

function playSlow() {
    clearInterval(map_animator);
    framerate = 500;
    playStart();
    repositionControlPanel();
}

function playStop() {
    clearInterval(map_animator);
    repositionControlPanel();
}

function yearAdvance() {
    clearInterval(map_animator);
    if (current_year < endyear - 1) {
        current_year += 1;
        updateData();
    }
    repositionControlPanel();
}

function yearReverse() {
    clearInterval(map_animator);
    if (current_year > startyear) {
        current_year -= 1;
        updateData();
    }
    repositionControlPanel();
}

function jumpBackward() {
    clearInterval(map_animator);
    if (current_year > startyear) {
        if (current_year % 50 === 0) {
            current_year = current_year - 50;
        } else {
            current_year = Math.floor(current_year / 50) * 50;
        }
        // don't go past the start!
        if (current_year < startyear) {
            current_year = startyear;
        }
        updateData();
    }
    repositionControlPanel();
}

function jumpForward() {
    clearInterval(map_animator);
    if (current_year < endyear) {
        if (current_year % 50 === 0) {
            current_year = current_year + 50;
        } else {
            current_year = (Math.floor(current_year / 50) * 50) + 50;
        }
        // don't go past the end!
        if (current_year > endyear) {
            current_year = endyear;
        }
        updateData();
    }
    repositionControlPanel();
}

function returnToStart() {
    clearInterval(map_animator);
    current_year = startyear;
    updateData();
    repositionControlPanel();
	$('#controlPanelCommentary').show();
}

function dockControlPanel() {
    control_panel
        .transition()
            .duration(300)
            .style("left", "0px")
            .style("top", "0px");
}

function repositionControlPanel() {
    $('#controlPanelCommentary').hide();
    if (control_panel_centered) {
        clearInterval(button_animator);
        $("#flashingButton button").removeClass("btn-large").addClass("btn-small").css("opacity", 1);
        dockControlPanel();
        control_panel_centered = false;
    }
}



//=================================================================
// Tooltip functions
//=================================================================

function tooltipOn (html) {
    // Hide the tooltip if it's already open somewhere
    tooltip.style("opacity", 0);
    html = "<div id=\"tooltipCloser\"><a href=\"#\" onclick=\"tooltipOff(0); return false;\"><i class=\"icon-remove\"></i></a></div>" + html;
    tooltip
        .html(html)
        .style("left", "0px")
        //.style("left", (d3.event.pageX) + "px")
        .style("top", (d3.event.pageY + 5) + "px");

    var tooltip_width = tooltip_jq.outerWidth();
    if (d3.event.pageX + tooltip_width > window.innerWidth) {
        tooltip.style("left", (window.innerWidth - tooltip_width) + "px");
    } else {
        tooltip.style("left", (d3.event.pageX) + "px");        
    }

    tooltip.transition()
        .duration(100)
        .style("opacity", 0.9);

}

function tooltipOff (delay_length) {
    tooltip.transition()
        .delay(delay_length)
        .duration(500)
        .style("opacity", 0)
        .each("end", function () {
            tooltip.html("");
        });
}

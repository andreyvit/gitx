var commit;

// Create a new Commit object
// obj: PBGitCommit object
var Commit = function(obj) {
	this.object = obj;

	this.refs = obj.refs();
	this.author_name = obj.author;
	this.sha = obj.realSha();
	this.parents = obj.parents;
	this.subject = obj.subject;
	this.notificationID = null;

	// TODO:
	// this.author_date instant

	// This can be called later with the output of
	// 'git show' to fill in missing commit details (such as a diff)
	this.parseDetails = function(details) {
		this.raw = details;

		var diffStart = this.raw.indexOf("\ndiff ");
		var messageStart = this.raw.indexOf("\n\n") + 2;

		if (diffStart > 0) {
			this.message = this.raw.substring(messageStart, diffStart).replace(/^    /gm, "").escapeHTML();
			this.diff = this.raw.substring(diffStart);
		} else {
			this.message = this.raw.substring(messageStart).replace(/^    /gm, "").escapeHTML();
			this.diff = "";
		}
		this.header = this.raw.substring(0, messageStart);

		var match = this.header.match(/\nauthor (.*) <(.*@.*|.*)> ([0-9].*)/);
		if (!(match[2].match(/@[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/)))
			this.author_email = match[2];

		this.author_date = new Date(parseInt(match[3]) * 1000);

		match = this.header.match(/\ncommitter (.*) <(.*@.*|.*)> ([0-9].*)/);
		this.committer_name = match[1];
		this.committer_email = match[2];
		this.committer_date = new Date(parseInt(match[3]) * 1000);		
	}

	this.reloadRefs = function() {
		this.refs = this.object.refs();
	}

};


var confirm_gist = function(confirmation_message) {
	if (!Controller.isFeatureEnabled_("confirmGist")) {
		gistie();
		return;
	}

	// Set optional confirmation_message
	confirmation_message = confirmation_message || "Yes. Paste this commit.";
	var deleteMessage = Controller.getConfig_("github.token") ? " " : "You might not be able to delete it after posting.<br>";
	var publicMessage = Controller.isFeatureEnabled_("publicGist") ? "<b>public</b>" : "private";
	// Insert the verification links into div#notification_message
	var notification_text = 'This will create a ' + publicMessage + ' paste of your commit to <a href="http://gist.github.com/">http://gist.github.com/</a><br>' +
	deleteMessage +
	'Are you sure you want to continue?<br/><br/>' +
	'<a href="#" onClick="hideNotification();return false;" style="color: red;">No. Cancel.</a> | ' +
	'<a href="#" onClick="gistie();return false;" style="color: green;">' + confirmation_message + '</a>';

	notify(notification_text, 0);
	// Hide img#spinner, since it?s visible by default
	$("spinner").style.display = "none";
}

var gistie = function() {
	notify("Uploading code to Gistie..", 0);

	parameters = {
		"file_ext[gistfile1]":      "patch",
		"file_name[gistfile1]":     commit.object.subject.replace(/[^a-zA-Z0-9]/g, "-") + ".patch",
		"file_contents[gistfile1]": commit.object.patch(),
	};

	// TODO: Replace true with private preference
	token = Controller.getConfig_("github.token");
	login = Controller.getConfig_("github.user");
	if (token && login) {
		parameters.login = login;
		parameters.token = token;
	}
	if (!Controller.isFeatureEnabled_("publicGist"))
		parameters.private = true;

	var params = [];
	for (var name in parameters)
		params.push(encodeURIComponent(name) + "=" + encodeURIComponent(parameters[name]));
	params = params.join("&");

	var t = new XMLHttpRequest();
	t.onreadystatechange = function() {
		if (t.readyState == 4 && t.status >= 200 && t.status < 300) {
			if (m = t.responseText.match(/gist: ([a-f0-9]+)/))
				notify("Code uploaded to gistie <a target='_new' href='http://gist.github.com/" + m[1] + "'>#" + m[1] + "</a>", 1);
			else {
				notify("Pasting to Gistie failed :(.", -1);
				Controller.log_(t.responseText);
			}
		}
	}

	t.open('POST', "http://gist.github.com/gists");
	t.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
	t.setRequestHeader('Accept', 'text/javascript, text/html, application/xml, text/xml, */*');
	t.setRequestHeader('Content-type', 'application/x-www-form-urlencoded;charset=UTF-8');

	try {
		t.send(params);
	} catch(e) {
		notify("Pasting to Gistie failed: " + e, -1);
	}
}

var setGravatar = function(email, image) {
	if (Controller && !Controller.isReachable_("www.gravatar.com"))
		return;

	if(Controller && !Controller.isFeatureEnabled_("gravatar")) {
		image.src = "";
		return;
	}

	if (!email) {
		image.src = "http://www.gravatar.com/avatar/?d=wavatar&s=60";
		return;
	}

	image.src = "http://www.gravatar.com/avatar/" +
		hex_md5(commit.author_email.toLowerCase().replace(/ /g, "")) + "?d=wavatar&s=60";
}

var selectCommit = function(a) {
	Controller.selectCommit_(a);
}

// Relead only refs
var reload = function() {
	$("notification").style.display = "none";
	commit.reloadRefs();
	showRefs();
}

var showRefs = function() {
	var refs = $("refs");
	if (commit.refs) {
		refs.parentNode.style.display = "";
		refs.innerHTML = "";
		for (var i = 0; i < commit.refs.length; i++) {
			var ref = commit.refs[i];
			refs.innerHTML += '<span class="refs ' + ref.type() + (commit.currentRef == ref.ref ? ' currentBranch' : '') + '">' + ref.shortName() + '</span>';
		}
	} else
		refs.parentNode.style.display = "none";
}

var loadCommit = function(commitObject, currentRef) {
	// These are only the things we can do instantly.
	// Other information will be loaded later by loadCommitDetails,
	// Which will be called from the controller once
	// the commit details are in.

	if (commit && commit.notificationID)
		clearTimeout(commit.notificationID);

	commit = new Commit(commitObject);
	commit.currentRef = currentRef;

	$("commitID").innerHTML = commit.sha;
	$("authorID").innerHTML = commit.author_name;
	$("subjectID").innerHTML = commit.subject.escapeHTML();
	$("diff").innerHTML = ""
	$("message").innerHTML = ""
	$("files").innerHTML = ""
	$("date").innerHTML = ""
	showRefs();

	for (var i = 0; i < $("commit_header").rows.length; ++i) {
		var row = $("commit_header").rows[i];
		if (row.innerHTML.match(/Parent:/)) {
			row.parentNode.removeChild(row);
			--i;
		}
	}

	// Scroll to top
	scroll(0, 0);

	if (!commit.parents)
		return;

	for (var i = 0; i < commit.parents.length; i++) {
		var newRow = $("commit_header").insertRow(-1);
		newRow.innerHTML = "<td class='property_name'>Parent:</td><td>" +
			"<a href='' onclick='selectCommit(this.innerHTML); return false;'>" +
			commit.parents[i] + "</a></td>";
	}

	commit.notificationID = setTimeout(function() { 
		if (!commit.fullyLoaded)
			notify("Loading commit…", 0);
		commit.notificationID = null;
	}, 500);

}

var showDiff = function() {

	// Callback for the diff highlighter. Used to generate a filelist
	var newfile = function(name1, name2, id, mode_change, old_mode, new_mode) {
		var button = document.createElement("div");
		var p = document.createElement("p");
		var link = document.createElement("a");
		link.setAttribute("href", "#" + id);
		p.appendChild(link);
		var buttonType = "";
		var finalFile = "";
		if (name1 == name2) {
			buttonType = "changed"
			finalFile = name1;
			if (mode_change)
				p.appendChild(document.createTextNode(" mode " + old_mode + " -> " + new_mode));
		}
		else if (name1 == "/dev/null") {
			buttonType = "created";
			finalFile = name2;
		}
		else if (name2 == "/dev/null") {
			buttonType = "deleted";
			finalFile = name1;
		}
		else {
			buttonType = "renamed";
			finalFile = name2;
			p.insertBefore(document.createTextNode(name1 + " -> "), link);
		}

		link.appendChild(document.createTextNode(finalFile));
		button.setAttribute("representedFile", finalFile);
		link.setAttribute("representedFile", finalFile);

		button.setAttribute("class", "button " + buttonType);
		button.appendChild(document.createTextNode(buttonType));
		$("files").appendChild(button);
		$("files").appendChild(p);
	}

	var binaryDiff = function(filename) {
		if (filename.match(/\.(png|jpg|icns|psd)$/i))
			return '<a href="#" onclick="return showImage(this, \'' + filename + '\')">Display image</a>';
		else
			return "Binary file differs";
	}
	
	highlightDiff(commit.diff, $("diff"), { "newfile" : newfile, "binaryFile" : binaryDiff });
}

var showImage = function(element, filename)
{
	element.outerHTML = '<img src="GitX://' + commit.sha + '/' + filename + '">';
	return false;
}

var enableFeature = function(feature, element)
{
	if(!Controller || Controller.isFeatureEnabled_(feature)) {
		element.style.display = "";
	} else {
		element.style.display = "none";
	}
}

var enableFeatures = function()
{
	enableFeature("gist", $("gist"))
	if(commit)
		setGravatar(commit.author_email, $("gravatar"));
	enableFeature("gravatar", $("gravatar"))
}

var loadCommitDetails = function(data)
{
	commit.parseDetails(data);

	if (commit.notificationID)
		clearTimeout(commit.notificationID)
	else
		$("notification").style.display = "none";

	var formatEmail = function(name, email) {
		return email ? name + " &lt;<a href='mailto:" + email + "'>" + email + "</a>&gt;" : name;
	}

	$("authorID").innerHTML = formatEmail(commit.author_name, commit.author_email);

	if (commit.committer_name != commit.author_name) {
		$("committerID").parentNode.style.display = "";
		$("committerID").innerHTML = formatEmail(commit.committer_name, commit.committer_email);

		$("committerDate").parentNode.style.display = "";
		$("committerDate").innerHTML = commit.committer_date;
	} else {
		$("committerID").parentNode.style.display = "none";
		$("committerDate").parentNode.style.display = "none";
	}

	$("date").innerHTML = commit.author_date;
	$("message").innerHTML = commit.message.replace(/\n/g,"<br>");

	if (commit.diff.length < 200000)
		showDiff();
	else
		$("diff").innerHTML = "<a class='showdiff' href='' onclick='showDiff(); return false;'>This is a large commit. Click here or press 'v' to view.</a>";

	hideNotification();
	enableFeatures();
}

var startEditingCommit = function() {
	if ($("editor").style.display == "none") {
		$("editor_step1").style.display = '';
		$("editor_step2").style.display = 'none';
		$("editor").style.display = "";
		args = ['cat-file', 'commit', commit.sha];
		Controller.runCommand_callBack_(args, function(data) {
			console.log("git \"" + args.join("\" \"") + "\"\n" + data);
			
			// convert dates into a natural format
			var zf = function(d) { return (d < 10 ? "0"+d : ""+d); }
			var lines = data.split("\n");
			var RE = /^(?:author|committer) .* (\d+) [+-]\d+\s*$/;
			for (var i = 0; i < lines.length; i++) {
				var line = lines[i];
				if (RE.exec(line)) {
					var epoch = parseInt(RegExp.$1);
					var date = new Date(epoch * 1000)
					var s = date.getFullYear() + "-" + zf(date.getMonth()) + "-" + zf(date.getDate()) + " " + zf(date.getHours()) + ":" + zf(date.getMinutes()) + ":" + zf(date.getSeconds());
					lines[i] = line.replace(RegExp.$1, s);
				}
			}
			data = lines.join("\n");
			
			$("editor_textarea").value = data;
		});
	} else {
		$("editor").style.display = "none";
	}
}

var finishEditingCommit = function() {
	var args, output;
	var newCommit = $("editor_textarea").value;
	
	// convert dates into a Git format
	var zf = function(d) { return (d < 10 ? "0"+d : ""+d); }
	var lines = newCommit.split("\n");
	var RE = /^(?:author|committer) .* (\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{1,2}:\d{1,2}) [+-]\d+\s*$/;
	for (var i = 0; i < lines.length; i++) {
		var line = lines[i];
		if (RE.exec(line)) {
			var orig = RegExp.$1;
			var comp = orig.replace(/[:-]/g, ' ').split(' ');
			var date = new Date(parseInt(comp[0]), parseInt(comp[1]), parseInt(comp[2]),
					parseInt(comp[3]), parseInt(comp[4]), parseInt(comp[5]), 0);
			var epoch = date.getTime() / 1000;
			lines[i] = line.replace(orig, ""+epoch);
		}
	}
	newCommit = lines.join("\n");
	
	// obtain the new object hash
	args = ['hash-object', '-t', 'commit', '-w', '--stdin'];
	output = Controller.outputForCommand_inputString_(args, newCommit);
	console.log("git \"" + args.join("\" \"") + "\"\n" + output);
	var newHash = output.replace(/\s*$/, '');
	
	$("editor_step1").style.display = 'none';
	$("editor_spinner").style.display = 'none';
	$("editor_step2").style.display = '';
	if (newHash == commit.sha) {
		$("editor_step2_message").innerHTML = 'Nothing changed. <a href="#" onClick="startEditingCommit();return false;" style="color: red;">Close.</a>';
	} else {
		$("editor_spinner").style.display = '';
		$("editor_step2_message").innerHTML = commit.sha + " &rarr; " + newHash;
		
		// delete backup refs from previous edit
		args = ['for-each-ref', '--format=%(refname)', 'refs/original-gitx/'];
		output = Controller.outputForCommand_inputString_(args, '');
		console.log("git \"" + args.join("\" \"") + "\"\n" + output);
		var lines = output.split("\n");
		for (var i = 0; i < lines.length; i++) {
			var ref = lines[i].replace(/\s+/g, '');
			if (ref.length == 0) continue;
			
			args = ['update-ref', '-d', ref];
			output = Controller.outputForCommand_inputString_(args, '');
			console.log("git \"" + args.join("\" \"") + "\"\n" + output);
		}
		
		// rewrite history
		args = ['filter-branch', '--parent-filter', "sed 's/" + commit.sha + "/" + newHash + "/'", '--tag-name-filter', 'cat', '--original', 'refs/original-gitx', '--', '--all'];
		Controller.runCommand_callBack_(args, function(data) {
			console.log("git \"" + args.join("\" \"") + "\"\n" + data);
			$("editor_spinner").style.display = 'none';
			$("editor_step2_message").innerHTML = commit.sha + " &rarr; " + newHash + "<br>" + '<a href="#" onClick="startEditingCommit();return false;" style="color: green;">Done. Close.</a>';
		});
		
		// update any remaining refs pointing to the old commit
		args = ['for-each-ref', '--format=%(objectname) %(refname)'];
		output = Controller.outputForCommand_inputString_(args, '');
		console.log("git \"" + args.join("\" \"") + "\"\n" + output);
		var lines = output.split("\n");
		for (var i = 0; i < lines.length; i++) {
			var line = lines[i].replace(/\s+$/g, '');
			if (line.length == 0) continue;
			
			var fields = line.split(" ");
			var sha = fields[0], ref = fields[1];
			
			if (sha == commit.sha) {
				args = ['update-ref', '-m', "changed commit message using GitX", ref, newHash, commit.sha];
				output = Controller.outputForCommand_inputString_(args, '');
				console.log("git \"" + args.join("\" \"") + "\"\n" + output);
			}
		}
		
		$("editor").style.display = 'none';
		Controller.commitMessageUpdated_(newHash);
	}
}

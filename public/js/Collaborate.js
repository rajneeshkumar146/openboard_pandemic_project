       $(document).ready(function () {
	// declare variables
	var $userTemplate, editors, socket, currentUser, canvas, context, pensize, colors;
	var current = {
		color: 'black',
		pensize: 2
	};
	var drawing = false;

	// assign variables
	$userTemplate = $('#userTemplate');
	$userForm = $('#userForm');
	editors = {};
	whiteBoards = {};
	$onlineUsers = $("#onlineUsers");
	$joinUser = $("#joinUser");

	// define functions
	function socketConnected() {
		console.log('socket connected');
	}

	function loginUser(event) {
		//event.preventDefault();

		if ($("#userName") && $("#userName").val() ) {
			currentUser = $("#userName").val();
			currentUser = currentUser.replace(/ /g, "_");
			$('title').html(currentUser);
			socket.emit('user-joined', currentUser);
			$joinUser.hide();
			$onlineUsers.show();
		} else {
			alert('Please Enter UserName');
		}
	}
	//call user joined of client
	function userJoined(allUsers) {
		for (i = 0; i < allUsers.length; i++) {
			var otherUser = allUsers[i];
			if ($('div[user=' + otherUser + ']').length == 0 && otherUser !== currentUser) {
				var $div = $('<div />');
				$div.html($userTemplate.html());
				$div.attr('user', otherUser);
				$div.find('span[purpose=user-name]').html(otherUser);
				$div.find('div[purpose=editor]').attr('id', otherUser + "Editor");

				var boardId = otherUser + "WhiteBoard";
				$div.find('canvas[purpose=whiteboard]').attr('id', boardId);

				var $li = $('<li action="loggedInUsers" class="list-group-item" userName="' + otherUser + '">' + otherUser + '</li>');
				$('body').append($div);
				$("#onlineUsersList").append($li);

				editors[otherUser] = ace.edit(otherUser + "Editor");
				editors[otherUser].setTheme("ace/theme/monokai");
				editors[otherUser].getSession().setMode("ace/mode/javascript");
				editors[otherUser].setReadOnly(true);
				editors[otherUser].getSession().on('change', sendEditorMessage);
				initCanvas($div, otherUser);
			}
		}
	}

	function initCanvas(containerId, otherUser) {
		canvas = $(containerId).find('.whiteboard')[0];
		colors = $(containerId).find('.color');
		pensize = $(containerId).find('.pensize');
		rubber = $(containerId).find('.rubber')[0];
		context = canvas.getContext('2d');

		whiteBoards[otherUser] = {
			context: context,
			isDisabled: true
		};


		canvas.addEventListener('mousedown', onMouseDown, false);
		canvas.addEventListener('mouseup', onMouseUp, false);
		canvas.addEventListener('mouseout', onMouseUp, false);
		canvas.addEventListener('mousemove', throttle(onMouseMove, 10), false);

		
		for (var i = 0; i < colors.length; i++) {
			colors[i].addEventListener('click', onColorUpdate, false);
		}

		for (var i = 0; i < pensize.length; i++) {
			pensize[i].addEventListener('click', onPenSizeUpdate, false);
		}
		rubber.addEventListener('click', clearCanvas, false);

		window.addEventListener('resize', onResize, false);
		onResize();
	}

	function userLeft(otherUser) {
		$('div[user=' + otherUser + ']').remove();
		$('li[username=' + otherUser + ']').remove();
		delete editors[otherUser];
		delete whiteBoards[otherUser];
	}

	function messageReceived(data) {
		switch (data.messageType) {
			case "chat":
				chatMessageReceived(data);
				break;
			case "control":
				controlMessageReceived(data);
				break;
			case "release":
				releaseMessageReceived(data);
				break;
			case "editor":
				editorMessageReceived(data);
				break;
			case "drawing":
				drawingDataReceived(data);
				break;
			case "clearDrawing":
				clearDrawingReceived(data);
				break;
			default:
				break;
		}
	}

	function chatMessageReceived(data) {
		var $parentDiv, $li;

		if (data.to === 'public') {
			$parentDiv = $('div[user=public]');
		} else {
			$parentDiv = $('div[user=' + data.from + ']');
		}

		var recievedData = '<div class="user"><span class="message-data-name"><i class="fa fa-circle online"></i>' + data.from + '</span></div>';
		$li = $('<li/>').html(recievedData + data.message).addClass('recieved-message');
		$parentDiv.find('ul[purpose=chat]').append($li);
		$parentDiv.find('span[purpose=activity]').html("Chat");
		$('ul[purpose=chat]').animate({
			scrollTop: $('ul[purpose=chat]').prop("scrollHeight")
		}, 500);

	}

	function controlMessageReceived(data) {
		var $parentDiv, otherUser;

		if (data.to === 'public') {
			$parentDiv = $('div[user=public]');
			otherUser = 'public';
		} else {
			$parentDiv = $('div[user=' + data.from + ']');
			otherUser = data.from;
		}

		$parentDiv.find('span[purpose=controlled-by]').html(data.from);
		editors[otherUser].setReadOnly(true);
		whiteBoards[otherUser].isDisabled = true;
		$parentDiv.find('[action=control]').attr('disabled', 'disabled');
		$parentDiv.find('span[purpose=activity]').html("Control");
	}

	function releaseMessageReceived(data) {
		var $parentDiv, otherUser;

		if (data.to === 'public') {
			$parentDiv = $('div[user=public]');
			otherUser = 'public';
		} else {
			$parentDiv = $('div[user=' + data.from + ']');
			otherUser = data.from;
		}

		$parentDiv.find('span[purpose=controlled-by]').html('');
		editors[otherUser].setReadOnly(true);
		whiteBoards[otherUser].isDisabled = true;
		$parentDiv.find('[action=control]').removeAttr('disabled');
		$parentDiv.find('span[purpose=activity]').html("Release");
	}

	function editorMessageReceived(data) {
		var $parentDiv, otherUser;

		if (data.to === 'public') {
			otherUser = 'public';
		} else {
			otherUser = data.from;
		}

		if (data.to === 'public') {
			$parentDiv = $('div[user=public]');
		} else {
			$parentDiv = $('div[user=' + data.from + ']');
		}

		editors[otherUser].setValue(data.message);
		$parentDiv.find('span[purpose=activity]').html("Editor");
	}

	function drawingDataReceived(data) {
		var otherUser;

		if (data.to === 'public') {
			otherUser = 'public';
		} else {
			otherUser = data.from;
		}

		var otherContext = whiteBoards[otherUser].context;
		var drawingData = data.message;
		x0 = drawingData.x0;
		y0 = drawingData.y0;

		y1 = drawingData.y1;
		x1 = drawingData.x1;
		otherContext.beginPath();
		otherContext.moveTo(x0, y0);
		otherContext.lineTo(x1, y1);
		otherContext.strokeStyle = drawingData.color;
		otherContext.lineWidth = drawingData.pensize;
		otherContext.stroke();
		otherContext.closePath();
	}




	function sendChatMessage() {
		//	if (window.event.which === 13) {
		var otherUser = $('div.big span[purpose=user-name]').html();

		var message = $('div.big textarea[purpose=chat]').val(); //$(this).par();
		//	$(this).val('');
		$('div.big textarea[purpose=chat]').val('');
		if (/\S/.test(message)) {
			if (message.length > 1) {
				var senderData = '<div class="user"><span class="message-data-name"><i class="fa fa-circle online"></i>' + currentUser + '</span></div>';
				var message = '<div class="message">' + message + '</div>';
				$li = $('<li/>').html(senderData + message).addClass('sent-message');
				$('div.big ul[purpose=chat]').append($li);
				$('ul[purpose=chat]').animate({
					scrollTop: $('ul[purpose=chat]').prop("scrollHeight")
				}, 500);
				socket.emit('message', {
					to: otherUser,
					from: currentUser,
					message: message,
					messageType: 'chat'
				});
			}
		}

		//	}
	}

	function sendControlMessage() {
		var otherUser = $('div.big span[purpose=user-name]').html();

		$('div.big span[purpose=controlled-by]').html(currentUser);
		editors[otherUser].setReadOnly(false);
		whiteBoards[otherUser].isDisabled = false;
		$('div.big [action=control]').attr('disabled', 'disabled');
		$('div.big [action=release]').removeAttr('disabled');

		socket.emit('message', {
			to: otherUser,
			from: currentUser,
			messageType: 'control'
		});

		return false;
	}

	function sendReleaseMessage() {
		var otherUser = $('div.big span[purpose=user-name]').html();

		$('div.big span[purpose=controlled-by]').html('');
		editors[otherUser].setReadOnly(true);
		whiteBoards[otherUser].isDisabled = true;
		$('div.big [action=control]').removeAttr('disabled');
		$('div.big [action=release]').attr('disabled', 'disabled');

		socket.emit('message', {
			to: otherUser,
			from: currentUser,
			messageType: 'release'
		});

		return false;
	}

	function sendEditorMessage(e) {
		var otherUser = $('div.big span[purpose=user-name]').html();

		if (editors[otherUser].curOp && editors[otherUser].curOp.command.name) {
			var message = editors[otherUser].getValue();

			socket.emit('message', {
				to: otherUser,
				from: currentUser,
				message: message,
				messageType: 'editor'
			});
		}
	}

	function showUser() {
		var userName = $(this).attr('userName');
		if (userName) {
			$onlineUsers.hide();
			//$(this).addClass('big');
			//var user = $('div[user=' + userName + ']');
			$('div[user=' + userName + ']').addClass('big');

			canvas = whiteBoards[userName];
			context = canvas.context;
		}
	}

	function dismissUser() {
		$(this).closest('div[user]').removeClass('big');
		$onlineUsers.show();
		return false;
	}

	//message related to drawing
	function drawLine(x0, y0, x1, y1) {
		var otherUser = $('div.big span[purpose=user-name]').html();
		var context = whiteBoards[otherUser].context;
		if (whiteBoards[otherUser].isDisabled) {
			return false;
		}
		x0 = x0 - 10;
		y0 = y0 - 90;

		y1 = y1 - 90;
		x1 = x1 - 10;
		context.beginPath();
		context.moveTo(x0, y0);
		context.lineTo(x1, y1);
		context.strokeStyle = current.color;
		context.lineWidth = current.pensize;
		context.stroke();
		context.closePath();

		
		var message1 = {
			x0: x0,
			y0: y0,
			x1: x1,
			y1: y1,
			color: current.color,
			pensize: current.pensize
		};
		var otherUser = $('div.big span[purpose=user-name]').html();


		socket.emit('message', {
			to: otherUser,
			from: currentUser,
			message: message1,
			messageType: 'drawing'
		});
	}

	function onMouseDown(e) {

		offsetX = e.target.offsetLeft + e.offsetX;
		offsetY = e.target.offsetTop + e.offsetY;

		drawing = true;
		current.x = (e.clientX || (e.touches[0] && e.touches[0].clientX));
		current.y = (e.clientY || (e.touches[0] || e.touches[0].clientY));
	}

	function onMouseUp(e) {
		if (!drawing) {
			return;
		}
		drawing = false;
		drawLine(current.x, current.y, e.clientX || (e.touches[0] && e.touches[0].clientX), e.clientY || (e.touches[0] && e.touches[0].clientY), true);
	}

	function onMouseMove(e) {
		if (!drawing) {
			return;
		}
		drawLine(current.x, current.y, e.clientX || e.touches[0].clientX, e.clientY || e.touches[0].clientY, true);
		current.x = e.clientX || (e.touches[0] && e.touches[0].clientX);
		current.y = e.clientY || (e.touches[0] && e.touches[0].clientY);
	}

	function onColorUpdate(e) {
		current.color = e.target.className.split(' ')[2];
	}

	function onPenSizeUpdate(e) {
		current.pensize = e.target.className.split(' ')[2];
	}

	// limit the number of events per second
	function throttle(callback, delay) {
		var previousCall = new Date().getTime();
		return function () {
			var time = new Date().getTime();

			if ((time - previousCall) >= delay) {
				previousCall = time;
				callback.apply(null, arguments);
			}
		};
	}

	function clearCanvas() {

		var otherUser = $('div.big span[purpose=user-name]').html();
		if (!whiteBoards[otherUser].isDisabled) {
			var otherUserContext = whiteBoards[otherUser].context;
			otherUserContext.clearRect(0, 0, otherUserContext.canvas.clientWidth, otherUserContext.canvas.clientHeight);


			socket.emit('message', {
				to: otherUser,
				from: currentUser,
				message: {},
				messageType: 'clearDrawing'
			});

		}
	}

	function clearDrawingReceived(data) {
		var otherUser;

		if (data.to === 'public') {
			otherUser = 'public';
		} else {
			otherUser = data.from;
		}

		var otherUserContext = whiteBoards[otherUser].context;
		otherUserContext.clearRect(0, 0, otherUserContext.canvas.clientWidth, otherUserContext.canvas.clientHeight);
	}


	// make the canvas fill its parent
	function onResize() {
		canvas.width = 500;
		canvas.height = 487;
	}



	// define Init
	function Init() {
		socket = io();
		socket.on("connect", socketConnected);
		socket.on('user-joined', userJoined);
		socket.on('user-left', userLeft);
		socket.on('message', messageReceived);

		//$(document).on("keypress", "textarea[purpose=chat]", sendChatMessage);
		$(document).on("click", "a[action=control]:not([disabled])", sendControlMessage);
		$(document).on("click", "a[action=release]:not([disabled])", sendReleaseMessage);

		$(document).on("click", "div[user]", showUser);
		$(document).on("click", "span[action=dismiss]", dismissUser);

		$(document).on("click", "input[action=loginUser]", loginUser);
		$(document).on("click", "li[action=loggedInUsers]", showUser);
		$(document).on("click", "i[id=sendicon]", sendChatMessage);

		userJoined(["public"]);
		$onlineUsers.hide();		
	}
	// Call Init
	Init();
});

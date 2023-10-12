import * as axios from 'axios';
import * as core from '@actions/core';
import * as github from '@actions/github';

const { context = {} } = github;
const { pull_request, head_commit } = context.payload;

const regexPullRequest = /Merge pull request \#\d+ from/g;
const trelloCardIdPattern = core.getInput('trello-card-id-pattern', { required: false }) || '#';
const trelloApiKey = core.getInput('trello-api-key', { required: true });
const trelloAuthToken = core.getInput('trello-auth-token', { required: true });
const trelloBoardId = core.getInput('trello-board-id', { required: true });
const trelloCardAction = core.getInput('trello-card-action', { required: true });
const trelloListNameCommit = core.getInput('trello-list-name-commit', { required: true });
const trelloListNamePullRequestOpen = core.getInput('trello-list-name-pr-open', { required: false });
const trelloListNamePullRequestClosed = core.getInput('trello-list-name-pr-closed', { required: false });

// function getCardNumbers(message) {
//   console.log(`getCardNumber(${message})`);
//   console.log(`Trello ID match pattern ${trelloCardIdPattern}`)
//   let ids = message && message.length > 0 ? message.replace(regexPullRequest, "").match(new RegExp(`${trelloCardIdPattern}`, 'g')) : [];
//   return ids && ids.length > 0 ? ids.map(x => x.replace(trelloCardIdPattern, '')) : null;
// }

async function getCardIdByName(board, cardName) {

	console.log(`getCardIdByName(${board}, ${cardName})`);

	if (cardName && cardName.length > 0) {

	  let url = `https://trello.com/1/boards/${board}/cards`;
	  console.log("Url is ", url);

	  return await axios.get(url, { 
		params: { 
		  key: trelloApiKey, 
		  token: trelloAuthToken 
		}
	  }).then(response => {
		var cardID = null;

		response.data.forEach(async card => {
			if (card.name == cardName)
				cardID =  card.id;
		});

		return cardID;
	  }).catch(error => {
		console.error(url, `Error ${error.response.status} ${error.response.statusText}`);
		return null;
	  });
	}
  
	return null;
  }

async function getCardOnBoard(board, card) {
  console.log(`getCardOnBoard(${board}, ${card})`);
  if (card && card.length > 0) {
    let url = `https://trello.com/1/boards/${board}/cards/${card}`;
    return await axios.get(url, { 
      params: { 
        key: trelloApiKey, 
        token: trelloAuthToken 
      }
    }).then(response => {
      return response.data;
    }).catch(error => {
      console.error(url, `Error ${error.response.status} ${error.response.statusText}`);
      return null;
    });
  }

  return null;
}

async function getListOnBoard(board, list) {
  console.log(`getListOnBoard(${board}, ${list})`);
  let url = `https://trello.com/1/boards/${board}/lists`
  return await axios.get(url, { 
    params: { 
      key: trelloApiKey, 
      token: trelloAuthToken 
    }
  }).then(response => {
    let result = response.data.find(l => l.closed == false && l.name == list);
    return result ? result.id : null;
  }).catch(error => {
    console.error(url, `Error ${error.response.status} ${error.response.statusText}`);
    return null;
  });
}


async function isGithubAttached(cardId)
 {
  console.log(`isGithubAttached(${cardId})`);
  let url = `https://trello.com/1/cards/${cardId}/attachments`
  return await axios.get(url, { 
		params: { 
		  key: trelloApiKey, 
		  token: trelloAuthToken 
		}
	  }).then(response => 
		{
			let ret = false;
			response.data.forEach(async attachment => {
			let index = attachment.url.indexOf("github.com");
			if (index !== -1)
			{
				console.log("done: ");
				ret = true;
			}
			});
				
		return ret;
	  }).catch(error => {
		console.error(url, `Error ${error.response.status} ${error.response.statusText}`);
		return ret;
	  });
}

async function addAttachmentToCard(card, link) {
	let cardId = card.id;

	if (card.attachments != 0)
	{
  		let isAttached = await isGithubAttached(cardId);
		  console.log(`isAttached: `, isAttached);

		if (isAttached)
		{
			console.log(`card ${card.name} is already attached`);
			return true;
		}
	}

  console.log(`addAttachmentToCard(${cardId}, ${link})`);
  let url = `https://api.trello.com/1/cards/${cardId}/attachments`;
  return await axios.post(url, {
    key: trelloApiKey,
    token: trelloAuthToken, 
    url: link
  }).then(response => {
    return response.status == 200;
  }).catch(error => {
    console.error(url, `Error ${error.response.status} ${error.response.statusText}`);
    return null;
  });
}

async function addCommentToCard(card, user, message, link) {
  console.log(`addCommentToCard(${card}, ${user}, ${message}, ${link})`);
  let url = `https://api.trello.com/1/cards/${card}/actions/comments`;
  return await axios.post(url, {
    key: trelloApiKey,
    token: trelloAuthToken, 
    text: `${user}: ${message} ${link}`
  }).then(response => {
    return response.status == 200;
  }).catch(error => {
    console.error(url, `Error ${error.response.status} ${error.response.statusText}`);
    return null;
  });
}

async function moveCardToList(board, card, list) {
  console.log(`moveCardToList(${board}, ${card}, ${list})`);
  let listId = await getListOnBoard(board, list);
  if (listId && listId.length > 0) {
    let url = `https://api.trello.com/1/cards/${card}`;
    return await axios.put(url, {
      key: trelloApiKey,
      token: trelloAuthToken, 
      idList: listId
    }).then(response => {
      return response && response.status == 200;
    }).catch(error => {
      console.error(url, `Error ${error.response.status} ${error.response.statusText}`);
      return null;
    });
  }       
  return null;
}

async function handlePullRequest(data) {
  console.log("handlePullRequest: ", data.state);
  let url = data.html_url || data.url;
  let message = data.title;
  let user = data.user.name;
  let branch = data.head.ref;

  let cardId = await getCardIdByName(trelloBoardId, branch);
  if (cardId == null)
  {
    throw new Error("Can't find card ID with the card name: " + branch);
  }

  let card = await getCardOnBoard(trelloBoardId, cardId);
    if (card) {
      if (trelloCardAction && trelloCardAction.toLowerCase() == 'attachment') {
        await addAttachmentToCard(card, url);
      }
      if (data.state == "open" && trelloListNamePullRequestOpen && trelloListNamePullRequestOpen.length > 0) {
        await moveCardToList(trelloBoardId, card.id, trelloListNamePullRequestOpen);
      }
      else if (data.state == "closed" && trelloListNamePullRequestClosed && trelloListNamePullRequestClosed.length > 0) {
        await moveCardToList(trelloBoardId, card.id, trelloListNamePullRequestClosed);
      }
    }
}

async function run() {
  if (pull_request && pull_request.title) {
    handlePullRequest(pull_request)
  }
};

run()
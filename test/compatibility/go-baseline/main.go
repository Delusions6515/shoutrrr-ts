// Command go-baseline captures synthetic service requests from pinned Go Shoutrrr.
// Run from the upstream Go checkout: go run <path-to-this-file> <fixture.json>.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/containrrr/shoutrrr/pkg/services/bark"
	"github.com/containrrr/shoutrrr/pkg/services/generic"
	"github.com/containrrr/shoutrrr/pkg/services/googlechat"
	"github.com/containrrr/shoutrrr/pkg/services/gotify"
	"github.com/containrrr/shoutrrr/pkg/services/ifttt"
	"github.com/containrrr/shoutrrr/pkg/services/join"
	"github.com/containrrr/shoutrrr/pkg/services/mattermost"
	"github.com/containrrr/shoutrrr/pkg/services/ntfy"
	"github.com/containrrr/shoutrrr/pkg/services/opsgenie"
	"github.com/containrrr/shoutrrr/pkg/services/pushbullet"
	"github.com/containrrr/shoutrrr/pkg/services/pushover"
	"github.com/containrrr/shoutrrr/pkg/services/rocketchat"
	"github.com/containrrr/shoutrrr/pkg/services/slack"
	"github.com/containrrr/shoutrrr/pkg/services/teams"
	"github.com/containrrr/shoutrrr/pkg/services/telegram"
	"github.com/containrrr/shoutrrr/pkg/services/zulip"
	"github.com/containrrr/shoutrrr/pkg/types"
	"github.com/jarcoal/httpmock"
)

type fixture struct {
	Service          string            `json:"service"`
	Params           map[string]string `json:"params"`
	URL              string            `json:"url"`
	Message          string            `json:"message"`
	ResponseStatus   int               `json:"responseStatus"`
	ResponseCode     int               `json:"responseCode"`
	CaptureAll       bool              `json:"captureAll"`
	TransportFailure bool              `json:"transportFailure"`
}
type observation struct {
	Method   string            `json:"method"`
	URL      string            `json:"url"`
	Headers  map[string]string `json:"headers"`
	Body     any               `json:"body"`
	Outcome  string            `json:"outcome"`
	Requests []observation     `json:"requests,omitempty"`
}

func main() {
	if len(os.Args) != 2 {
		log.Fatal("expected one fixture path")
	}
	data, err := os.ReadFile(os.Args[1])
	if err != nil {
		log.Fatal(err)
	}
	var input fixture
	if err := json.Unmarshal(data, &input); err != nil {
		log.Fatal(err)
	}
	parsed, err := url.Parse(input.URL)
	if err != nil || (!strings.HasSuffix(parsed.Hostname(), ".example.test") && !(input.Service == "join" && parsed.Hostname() == "join") && !(input.Service == "teams" && parsed.Hostname() == "22222222-4444-4444-8444-cccccccccccc") && !(input.Service == "slack" && (parsed.Hostname() == "webhook" || parsed.Hostname() == "C0123456789" || parsed.Hostname() == "AAAAAAAAA")) && !(input.Service == "telegram" && parsed.Hostname() == "telegram") && !(input.Service == "pushbullet" && (parsed.Hostname() == strings.Repeat("a", 34) || parsed.Hostname() == strings.Repeat("A", 34)))) ||
		((input.Service == "bark" && parsed.Scheme != "bark") ||
			(input.Service == "gotify" && parsed.Scheme != "gotify") ||
			(input.Service == "googlechat" && parsed.Scheme != "googlechat" && parsed.Scheme != "hangouts") ||
			(input.Service == "zulip" && parsed.Scheme != "zulip") ||
			(input.Service == "ntfy" && parsed.Scheme != "ntfy") ||
			(input.Service == "ifttt" && parsed.Scheme != "ifttt") ||
			(input.Service == "teams" && parsed.Scheme != "teams" && parsed.Scheme != "teams+https") ||
			(input.Service == "opsgenie" && parsed.Scheme != "opsgenie") ||
			(input.Service == "slack" && parsed.Scheme != "slack") ||
			(input.Service == "telegram" && parsed.Scheme != "telegram") ||
			(input.Service == "rocketchat" && parsed.Scheme != "rocketchat") ||
			(input.Service == "mattermost" && parsed.Scheme != "mattermost") ||
			(input.Service == "pushover" && parsed.Scheme != "pushover") ||
			(input.Service == "pushbullet" && parsed.Scheme != "pushbullet") ||
			(input.Service == "join" && parsed.Scheme != "join") ||
			(input.Service != "bark" && input.Service != "gotify" && input.Service != "googlechat" && input.Service != "zulip" && input.Service != "ntfy" && input.Service != "ifttt" && input.Service != "teams" && input.Service != "opsgenie" && input.Service != "slack" && input.Service != "telegram" && input.Service != "rocketchat" && input.Service != "mattermost" && input.Service != "pushover" && input.Service != "pushbullet" && input.Service != "join" && !strings.HasPrefix(parsed.Scheme, "generic"))) {
		log.Fatal("only synthetic service fixtures are accepted")
	}
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()
	var captured *observation
	var requests []observation
	httpmock.RegisterNoResponder(func(req *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(req.URL.Hostname(), ".example.test") &&
			req.URL.Hostname() != "api.pushover.net" && req.URL.Hostname() != "api.pushbullet.com" && req.URL.Hostname() != "maker.ifttt.com" && req.URL.Hostname() != "outlook.office.com" && req.URL.Hostname() != "api.opsgenie.com" && req.URL.Hostname() != "hooks.slack.com" && req.URL.Hostname() != "slack.com" && req.URL.Hostname() != "api.telegram.org" && req.URL.Hostname() != "joinjoaomgcd.appspot.com" {
			return nil, fmt.Errorf("unexpected destination")
		}
		var payload []byte
		if req.Body != nil {
			var err error
			payload, err = io.ReadAll(req.Body)
			if err != nil {
				return nil, err
			}
		}
		var body any = string(payload)
		if json.Valid(payload) {
			if err := json.Unmarshal(payload, &body); err != nil {
				return nil, err
			}
		}
		captured = &observation{Method: req.Method, URL: req.URL.String(), Headers: map[string]string{
			"content-type": req.Header.Get("Content-Type"), "accept": req.Header.Get("Accept"),
		}, Body: body, Outcome: "success"}
		if input.Service == "opsgenie" || input.Service == "slack" {
			captured.Headers["authorization"] = req.Header.Get("Authorization")
		}
		if input.Service == "pushbullet" {
			captured.Headers["access-token"] = req.Header.Get("Access-Token")
		}
		if input.Service == "zulip" {
			captured.Headers["authorization"] = req.Header.Get("Authorization")
		}
		if input.Service == "ntfy" {
			for _, key := range []string{"User-Agent", "Priority", "Title", "Tags", "Delay", "Actions", "Click", "Attach", "X-Icon", "Filename", "Email", "Cache", "Firebase", "Markdown", "Authorization"} {
				if value := req.Header.Get(key); value != "" {
					captured.Headers[strings.ToLower(key)] = value
				}
			}
		}
		requests = append(requests, *captured)
		if input.TransportFailure {
			return nil, fmt.Errorf("synthetic transport failure")
		}
		status := input.ResponseStatus
		if status == 0 {
			status = 200
		}
		if input.Service == "telegram" {
			if status >= 300 || input.ResponseCode != 0 {
				return httpmock.NewStringResponse(status, `{"ok":false,"error_code":400,"description":"synthetic"}`), nil
			}
			return httpmock.NewStringResponse(status, `{"ok":true,"result":{"message_id":1,"text":"ok"}}`), nil
		}
		if input.Service == "slack" {
			if req.URL.Hostname() == "slack.com" {
				if status >= 300 || input.ResponseCode != 0 {
					return httpmock.NewStringResponse(status, `{"ok":false,"error":"synthetic"}`), nil
				}
				return httpmock.NewStringResponse(status, `{"ok":true}`), nil
			}
			if status >= 300 || input.ResponseCode != 0 {
				return httpmock.NewStringResponse(status, "synthetic rejection"), nil
			}
			return httpmock.NewStringResponse(status, "ok"), nil
		}
		if input.Service == "ntfy" {
			if status >= 300 {
				return httpmock.NewStringResponse(status, `{"code":503,"error":"synthetic"}`), nil
			}
			return httpmock.NewStringResponse(status, `{}`), nil
		}
		if input.Service == "pushbullet" {
			if status >= 300 {
				return httpmock.NewStringResponse(status, `{"error":{"message":"synthetic","type":"invalid","cat":"invalid"}}`), nil
			}
			return httpmock.NewStringResponse(status, `{}`), nil
		}
		if input.Service == "gotify" {
			if status >= 300 {
				return httpmock.NewStringResponse(status, `{"error":"synthetic","errorCode":503,"errorDescription":"unavailable"}`), nil
			}
			return httpmock.NewStringResponse(status, `{"id":1,"appid":1,"message":"ok","title":"ok","priority":0}`), nil
		}
		if input.Service == "bark" {
			code := input.ResponseCode
			if code == 0 {
				code = 200
			}
			return httpmock.NewStringResponse(status, fmt.Sprintf(`{"code":%d,"message":"synthetic response"}`, code)), nil
		}
		return httpmock.NewStringResponse(status, "synthetic response"), nil
	})
	var params *types.Params
	if input.Params != nil {
		value := types.Params(input.Params)
		params = &value
	}
	if input.Service == "telegram" {
		service := &telegram.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else if input.Service == "slack" {
		service := &slack.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else if input.Service == "opsgenie" {
		service := &opsgenie.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else if input.Service == "teams" {
		service := &teams.Service{}
		if parsed.Scheme == "teams+https" {
			parsed, err = service.GetConfigURLFromCustom(parsed)
			if err != nil {
				log.Fatal("Go shortcut conversion failed")
			}
		}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else if input.Service == "ifttt" {
		service := &ifttt.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		// Pinned Go prints the entire payload to stdout. Discard that unsafe output;
		// only synthetic request observations are emitted by the harness.
		old := os.Stdout
		devNull, openErr := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
		if openErr != nil {
			log.Fatal("cannot suppress upstream payload logging")
		}
		os.Stdout = devNull
		err = service.Send(input.Message, params)
		os.Stdout = old
		_ = devNull.Close()
	} else if input.Service == "ntfy" {
		service := &ntfy.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else if input.Service == "zulip" {
		service := &zulip.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else if input.Service == "pushbullet" {
		service := &pushbullet.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else if input.Service == "googlechat" {
		service := &googlechat.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else if input.Service == "pushover" {
		service := &pushover.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else if input.Service == "join" {
		service := &join.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else if input.Service == "rocketchat" {
		service := &rocketchat.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else if input.Service == "mattermost" {
		service := &mattermost.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else if input.Service == "gotify" {
		service := &gotify.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		httpmock.ActivateNonDefault(service.GetHTTPClient())
		err = service.Send(input.Message, params)
	} else if input.Service == "bark" {
		service := &bark.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	} else {
		service := &generic.Service{}
		if strings.HasPrefix(parsed.Scheme, "generic+") {
			parsed, err = service.GetConfigURLFromCustom(parsed)
			if err != nil {
				log.Fatal("Go shortcut conversion failed")
			}
		}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, params)
	}
	if captured == nil {
		log.Fatal("no request captured")
	}
	if err != nil {
		switch {
		case input.TransportFailure:
			captured.Outcome = "transport-error"
		case input.ResponseStatus >= 300:
			captured.Outcome = fmt.Sprintf("http-status-%d", input.ResponseStatus)
		case input.ResponseCode != 0 && input.ResponseCode != 200:
			captured.Outcome = fmt.Sprintf("api-code-%d", input.ResponseCode)
		default:
			log.Fatal("unexpected Go send failure")
		}
	} else if input.TransportFailure || input.ResponseStatus >= 300 || (input.ResponseCode != 0 && input.ResponseCode != 200 && input.Service != "telegram") {
		log.Fatal("Go did not reject the injected failure")
	}
	if input.CaptureAll {
		captured.Requests = requests
	}
	if err := json.NewEncoder(os.Stdout).Encode(captured); err != nil {
		log.Fatal(err)
	}
}

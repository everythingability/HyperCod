/**
 * Help Module — HyperCard PWA
 * Provides a searchable/scrollable list of HyperCode examples.
 */
export class Help {
  constructor(app) {
    this.app = app;
    this._el = null;
    this._visible = false;
  }

  init() {
    const el = document.getElementById('help-windoid');
    this._el = el;
    el.innerHTML = `
      <div class="windoid-title" id="help-drag">
        <span class="windoid-close" style="float:left;width:11px;height:11px;border:1px solid #000;margin:1px 0 0 0px;cursor:pointer;background:#fff;" title="Close"></span>
        HyperCode Help
      </div>
      <div class="help-content">
        <div class="help-section">
          <div class="help-h">Navigation</div>
          <div class="help-desc">Moving between cards:</div>
          <code class="help-code">go next
go previous
go first
go last
go to card "Home"
go back</code>
        </div>

        <div class="help-section">
          <div class="help-h">Putting Content</div>
          <div class="help-desc">Setting field text:</div>
          <code class="help-code">put "Hello" into card field "Name"
put 100 into card field 1
put "!" after card field "Notes"
put empty into card field 2</code>
        </div>

        <div class="help-section">
          <div class="help-h">Messages & Events</div>
          <div class="help-desc">Common event handlers:</div>
          <code class="help-code">on mouseUp
  answer "Hello!"
end mouseUp

on openCard
  put the date into field 1
end openCard</code>
        </div>

        <div class="help-section">
          <div class="help-h">Dialogs</div>
          <div class="help-desc">Interacting with users:</div>
          <code class="help-code">answer "Yes or No?" with "Yes" or "No"
ask "What is your name?"
put it into card field "User"</code>
        </div>

        <div class="help-section">
          <div class="help-h">System Properties</div>
          <div class="help-desc">Reading/Setting properties:</div>
          <code class="help-code">set visible of button 1 to false
set textColor of field "Info" to "red"
put the number of cards into it</code>
        </div>

        <div class="help-section">
          <div class="help-h">JavaScript Mode</div>
          <div class="help-desc">Using JS directly:</div>
          <code class="help-code">// @javascript
alert("JS Running!");
go("next");
log("Length", cards().length);</code>
        </div>

        <div class="help-section">
          <div class="help-h">Wait & Time</div>
          <div class="help-desc">Delays and timers:</div>
          <code class="help-code">wait 1000 -- ms
put the system time into field 1</code>
        </div>
      </div>`;

    this.app.ui._makeDraggable(el, el.querySelector('#help-drag'));
    el.querySelector('.windoid-close').addEventListener('click', () => this.hide());
    // Hidden by default
    el.style.display = 'none';
  }

  toggle() {
    if (this._el.style.display === 'none') this.show();
    else this.hide();
  }

  show() {
    this._visible = true;
    this._el.style.display = 'flex';
    this.app.ui._updateMenuLabels();
  }

  hide() {
    this._visible = false;
    this._el.style.display = 'none';
    this.app.ui._updateMenuLabels();
  }
}

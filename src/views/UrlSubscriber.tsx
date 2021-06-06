import * as React from 'react';
import { Button, ControlLabel, FormControl, FormGroup, InputGroup } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { ComponentEx, FlexLayout, Icon, More, selectors, Toggle, tooltip, types, util } from 'vortex-api';

import { generate } from 'shortid';

import { IUrlSub } from '../types';

import { clearFulfillerSubscription, setFulfillerSubscription } from '../actions/persistent';
import {
  addUrlSub, removeUrlSub, setAutoFulfillDependencies,
  setEnableDebugMode, setLockSub, setUrlSub,
} from '../actions/settings';

import { DEP_MAN_SUFFIX } from '../common';

interface IConnectedProps {
  lockSub: boolean;
  subId: string;
  profile: types.IProfile;
  availableSubs: IUrlSub[];
}

interface IActionProps {
  onSetLock: (lock: boolean) => void;
  onAddSub: (sub: IUrlSub) => void;
  onRemoveSub: (id: string) => void;
  onEditSub: (id: string, sub: IUrlSub) => void;
  onSetSubscription: (profileId: string, subId: string) => void;
  onClearSubscription: (profileId: string) => void;
}

interface IComponentState {
  selectedUrlSubId: string;
}

type IProps = IActionProps & IConnectedProps;

class UrlSubscriber extends ComponentEx<IProps, IComponentState> {
  private mNone: IUrlSub = {
    id: 'none',
    name: 'No Subscription',
    url: 'none',
  };
  constructor(props: IProps) {
    super(props);
    this.initState({
      selectedUrlSubId: undefined,
    });
  }

  public componentDidMount() {
    const { subId } = this.props;
    this.nextState.selectedUrlSubId = subId;
  }

  public render(): JSX.Element {
    const { t, lockSub, subId, availableSubs } = this.props;
    const { selectedUrlSubId } = this.state;
    const sub = this.getSub(selectedUrlSubId);
    const title = (sub?.name !== undefined) ? sub.name : 'Select URL';
    return (
      <FormGroup id='fulfiller-subscribe-url-select'>
        <ControlLabel>
          {t('Select a URL you wish to subscribe to ')}
          <More id='more-fulfiller-subs' name={t('Subscribed Url')} >
            {t('Use the buttons below to Add/Remove/Edit a subscription. '
             + 'The Dependency Fulfiller will use the selected subscription to fetch '
             + 'dependency data and attempt to download the required mods from the URL '
             + 'specified by the subscription when clicking the "Import From Subscription" '
             + 'button in the mods page.')}
          </More>
        </ControlLabel>
        <FlexLayout type='row'>
          <FlexLayout.Fixed>
            <InputGroup style={{ padding: '0px 0px 0px 2px' }}>
              <FormControl
                componentClass='select'
                onChange={this.selectSub}
                value={selectedUrlSubId}
              >
                {[].concat(this.mNone, availableSubs).map(this.renderSubUrl)}
              </FormControl>
            </InputGroup>
          </FlexLayout.Fixed>
          <FlexLayout.Fixed>
            <InputGroup.Button style={{ padding: '0px 2px 0px 6px' }}>
              <tooltip.Button
                tooltip={t('Add New Subscription')}
                onClick={this.subEditorDialog}
              >
                <Icon name='add' />
              </tooltip.Button>
            </InputGroup.Button>
            <InputGroup.Button style={{ padding: '0px 2px 0px 2px' }}>
              <tooltip.Button
                tooltip={t('Remove Subscription')}
                onClick={this.removeSub}
                disabled={selectedUrlSubId === undefined}
              >
                <Icon name='remove' />
              </tooltip.Button>
            </InputGroup.Button>
            <InputGroup.Button style={{ padding: '0px 2px 0px 2px' }}>
              <tooltip.Button
                data-id={selectedUrlSubId}
                tooltip={t('Edit Subscription')}
                onClick={this.subEditorDialog}
                disabled={selectedUrlSubId === undefined}
              >
                <Icon name='show' />
              </tooltip.Button>
            </InputGroup.Button>
          </FlexLayout.Fixed>
        </FlexLayout>
        <Toggle
          checked={lockSub}
          onToggle={this.toggleLock}
        >
          {t('Lock your mod list to the assigned subscription')}
          <More id='dep-lock-info' name='Lock Subscription'>
          {t('If toggled and a valid subscription is selected, Vortex will '
           + 'automatically disable mods that are not part of the dependency data '
           + 'it downloads from the URL defined by the subscription. All dependencies '
           + 'will be automatically enabled upon their successful installation.',
           { replace: { suffix: DEP_MAN_SUFFIX } })}
          </More>
        </Toggle>
      </FormGroup>
    );
  }

  private removeSub = () => {
    const { selectedUrlSubId } = this.state;
    const { onRemoveSub, profile, onClearSubscription } = this.props;
    onRemoveSub(selectedUrlSubId);
    onClearSubscription(profile.id);
  }

  private nop = () => null;
  private renderSubUrl = (sub: IUrlSub) => {
    return <option
      key={sub.id}
      value={sub.id}
      data-id={sub.id}
    >
      {sub.name}
    </option>;
  }

  private selectSub = (evt) => {
    const { profile, onSetSubscription } = this.props;
    const subId: string = evt.target.selectedOptions[0]?.getAttribute('data-id');
    if (subId === 'none') {
      this.nextState.selectedUrlSubId = undefined;
      onSetSubscription(profile.id, undefined);
    } else {
      this.nextState.selectedUrlSubId = subId;
      onSetSubscription(profile.id, subId);
    }
  }

  private toggleLock = (lock: boolean) => {
    const { onSetLock } = this.props;
    onSetLock(lock);
  }

  private getSub(id: string) {
    const { availableSubs } = this.props;
    return availableSubs.find(sub => sub.id === id);
  }

  private subEditorDialog = async (evt) => {
    const id = evt.currentTarget.getAttribute('data-id');
    const { onEditSub, onAddSub } = this.props;
    const sub: IUrlSub = this.getSub(id);
    const res = await this.context.api.showDialog('info', 'Create/Edit URL Subscription',
    {
      text: 'Please type in a human readable name for this subscription and a valid URL '
          + 'from which the dependencies JSON can be fetched.',
      input: [
        { id: 'name', type: 'text', value: sub?.name, placeholder: 'A unique name to identify this url by' },
        { id: 'url', type: 'text', value: sub?.url, placeholder: 'https://www.pathtoajsonfile.com/file.json' },
      ],
    }, [
      { label: 'Cancel' },
      { label: 'Save' },
    ]);

    if (res.action === 'Save') {
      const name = res.input['name'];
      let url;
      try {
        url = new URL(res.input['url']);
      } catch (err) {
        this.context.api.showErrorNotification('Invalid URL - try again', err,
          { allowReport: false });
        return;
      }

      const newSub: IUrlSub = {
        id: sub?.id !== undefined ? sub.id : generate(),
        name,
        url,
      };

      if (sub !== undefined) {
        onEditSub(sub.id, newSub);
      } else {
        onAddSub(newSub);
      }
    }
  }
}

function mapStateToProps(state: types.IState): IConnectedProps {
  const profile = selectors.activeProfile(state);
  return {
    profile,
    subId: util.getSafe(state, ['persistent', 'depfulfiller', profile.id, 'subId'], undefined),
    lockSub: util.getSafe(state, ['settings', 'interface', 'lockSub'], false),
    availableSubs: util.getSafe(state, ['settings', 'interface', 'urlSubscriptions'], []),
  };
}

function mapDispatchToProps(dispatch: Redux.Dispatch<any>): IActionProps {
  return {
    onSetLock: (lock: boolean) => dispatch(setLockSub(lock)),
    onAddSub: (sub: IUrlSub) => dispatch(addUrlSub(sub)),
    onEditSub: (id: string, sub: IUrlSub) => dispatch(setUrlSub(id, sub)),
    onRemoveSub: (id: string) => dispatch(removeUrlSub(id)),
    onSetSubscription: (profileId: string, subId: string) =>
      dispatch(setFulfillerSubscription(profileId, subId)),
    onClearSubscription: (profileId: string) =>
      dispatch(clearFulfillerSubscription(profileId)),
  };
}

export default withTranslation(['common', 'dependency-fulfiller'])(
  connect(mapStateToProps, mapDispatchToProps)(
    UrlSubscriber) as any) as React.ComponentClass<{}>;
